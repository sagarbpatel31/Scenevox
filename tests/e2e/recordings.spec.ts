import { expect, test, type Page } from "@playwright/test";

type Mode =
  "normal" | "delay" | "error" | "disconnect" | "no-timings" | "timeout";
const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const collected: string[] = [];
  errors.set(page, collected);
  page.on("pageerror", (error) => collected.push(error.message));
});
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
});
async function simulatedProvider(page: Page, mode: Mode = "normal") {
  const requests: { greeting: string; voice: string }[] = [],
    endings: string[] = [];
  await page.route("**/api/health", (route) =>
    route.fulfill({ json: { provider: "assemblyai-ready" } }),
  );
  await page.route("**/api/voice-agent/voices", (route) =>
    route.fulfill({
      json: {
        voices: [
          { id: "alba", name: "Alba" },
          { id: "george", name: "George" },
        ],
        source: "simulated",
      },
    }),
  );
  await page.route("**/api/voice-agent/token", async (route) => {
    expect(route.request().postDataJSON()).toEqual({ purpose: "render" });
    await route.fulfill({
      json: { token: "simulated-only", maxSessionDurationSeconds: 60 },
    });
  });
  await page.routeWebSocket("wss://agents.assemblyai.com/**", (socket) => {
    let timer: ReturnType<typeof setTimeout>;
    socket.onMessage((raw) => {
      const event = JSON.parse(raw.toString());
      if (event.type === "session.end") {
        clearTimeout(timer);
        endings.push("session.ended");
        socket.send(JSON.stringify({ type: "session.ended" }));
        return;
      }
      expect(event.type).toBe("session.update");
      const { greeting, output } = event.session;
      requests.push({ greeting, voice: output.voice });
      socket.send(
        JSON.stringify({
          type: "session.ready",
          session_id: `simulated-${requests.length}`,
        }),
      );
      if (mode === "disconnect") {
        socket.close();
        return;
      }
      if (mode === "timeout") return;
      timer = setTimeout(
        () => {
          if (mode === "error") {
            socket.send(
              JSON.stringify({ type: "session.error", code: "server_error" }),
            );
            return;
          }
          const pcm = Buffer.alloc(24000 * 2);
          for (let i = 0; i < 24000; i++)
            pcm.writeInt16LE(
              Math.round(
                Math.sin(i / (output.voice === "alba" ? 10 : 20)) * 8000,
              ),
              i * 2,
            );
          socket.send(
            JSON.stringify({ type: "reply.started", reply_id: "reply" }),
          );
          socket.send(
            JSON.stringify({
              type: "reply.audio",
              data: pcm.toString("base64"),
            }),
          );
          if (mode !== "no-timings")
            socket.send(
              JSON.stringify({
                type: "transcript.agent.delta",
                delta: greeting,
                start_ms: 0,
                end_ms: 1000,
              }),
            );
          socket.send(
            JSON.stringify({ type: "transcript.agent", text: greeting }),
          );
          socket.send(
            JSON.stringify({ type: "reply.done", status: "completed" }),
          );
        },
        mode === "delay" ? 1500 : 30,
      );
    });
  });
  return { requests, endings };
}
async function ready(page: Page) {
  await page.goto("/");
  await expect(page.getByText("Saved on this device")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Generate take", exact: true }),
  ).toBeEnabled();
}
async function generate(page: Page) {
  await page
    .getByRole("button", { name: "Generate take", exact: true })
    .click();
  await expect(page.getByTestId("render-status")).toContainText("Take ready", {
    timeout: 15000,
  });
}
async function downloadedBytes(
  page: Page,
  button: ReturnType<Page["getByRole"]>,
) {
  const downloadPromise = page.waitForEvent("download");
  await button.click();
  const stream = await (await downloadPromise).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

test("assembled scene supports play, pause, resume, seeking and line jumps", async ({
  page,
}, testInfo) => {
  const { requests } = await simulatedProvider(page);
  await ready(page);
  await page.getByRole("button", { name: "Render scene", exact: true }).click();
  await expect(page.getByTestId("render-status")).toContainText("Scene ready");
  const player = page.getByRole("region", { name: "Assembled scene player" });
  await player.screenshot({ path: testInfo.outputPath("scene-review.png") });
  const media = () =>
    page.getByTestId("scene-audio").evaluate((audio: HTMLAudioElement) => ({
      paused: audio.paused,
      time: audio.currentTime,
      duration: audio.duration,
    }));
  await player
    .getByRole("button", { name: "Play recorded scene", exact: true })
    .click();
  await expect.poll(async () => (await media()).time).toBeGreaterThan(0.05);
  await player
    .getByRole("button", { name: "Pause recorded scene", exact: true })
    .click();
  const paused = await media();
  expect(paused.paused).toBe(true);
  expect(paused.duration).toBeCloseTo(4.9, 3);
  await page.waitForTimeout(120);
  expect((await media()).time).toBe(paused.time);
  await player
    .getByRole("button", { name: "Jump to recorded line 3: Mara Venn" })
    .click();
  await expect.poll(async () => (await media()).time).toBeCloseTo(2.6, 2);
  await player
    .getByRole("button", { name: "Play recorded scene", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Select line 3: Mara Venn" }),
  ).toHaveClass(/active/);
  await player
    .getByRole("button", { name: "Pause recorded scene", exact: true })
    .click();
  const slider = player.getByLabel("Seek recorded scene");
  await slider.focus();
  await slider.press("End");
  await expect.poll(async () => (await media()).time).toBeCloseTo(4.9, 2);
  await player
    .getByRole("button", { name: "Stop scene playback", exact: true })
    .click();
  await expect.poll(async () => (await media()).time).toBe(0);
  expect(requests).toHaveLength(4);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("intentional quick pause does not surface a late rejected play request", async ({
  page,
}) => {
  await simulatedProvider(page);
  await ready(page);
  await page.getByRole("button", { name: "Render scene", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Play recorded scene", exact: true }),
  ).toBeEnabled();
  await page.getByTestId("scene-audio").evaluate((audio: HTMLAudioElement) => {
    const original = audio.play.bind(audio);
    audio.play = async () => {
      await original();
      await new Promise<void>((_resolve, reject) => {
        (
          audio as HTMLAudioElement & { rejectPendingPlay: () => void }
        ).rejectPendingPlay = () =>
          reject(new DOMException("Play interrupted by pause", "AbortError"));
      });
    };
  });
  await page
    .getByRole("button", { name: "Play recorded scene", exact: true })
    .click();
  await expect
    .poll(() =>
      page
        .getByTestId("scene-audio")
        .evaluate(
          (audio) =>
            typeof (
              audio as HTMLAudioElement & { rejectPendingPlay?: () => void }
            ).rejectPendingPlay,
        ),
    )
    .toBe("function");
  await page
    .getByRole("button", { name: "Pause recorded scene", exact: true })
    .click();
  await page.getByTestId("scene-audio").evaluate(async (audio) => {
    (
      audio as HTMLAudioElement & { rejectPendingPlay: () => void }
    ).rejectPendingPlay();
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
  });
  await expect(
    page
      .getByRole("region", { name: "Assembled scene player" })
      .getByRole("alert"),
  ).toHaveCount(0);
  expect(
    await page
      .getByTestId("scene-audio")
      .evaluate((audio: HTMLAudioElement) => audio.paused),
  ).toBe(true);
});

test("scene mix, individual recordings and device preview never compete", async ({
  page,
}) => {
  await simulatedProvider(page);
  await ready(page);
  await page.getByRole("button", { name: "Render scene", exact: true }).click();
  await expect(page.getByTestId("render-status")).toContainText("Scene ready");
  await page
    .getByRole("button", { name: "Play recorded scene", exact: true })
    .click();
  await page.getByRole("button", { name: "Play A", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Stop recording", exact: true }),
  ).toBeVisible();
  expect(
    await page
      .getByTestId("scene-audio")
      .evaluate((audio: HTMLAudioElement) => audio.paused),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Play recorded scene", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Stop recording", exact: true }),
  ).toHaveCount(0);
  await page.evaluate(() => {
    window.speechSynthesis.speak = (utterance) =>
      utterance.onstart?.(new Event("start") as SpeechSynthesisEvent);
    window.speechSynthesis.cancel = () => {};
  });
  await page
    .getByRole("button", { name: "Preview selected line", exact: true })
    .click();
  expect(
    await page
      .getByTestId("scene-audio")
      .evaluate((audio: HTMLAudioElement) => audio.paused),
  ).toBe(true);
  await expect(
    page.getByRole("button", { name: "Select line 1: Mara Venn" }),
  ).toHaveClass(/active/);
});

test("rerendering or opening the Director stops scene playback without a late restart", async ({
  page,
}) => {
  const { requests } = await simulatedProvider(page);
  await ready(page);
  await page.getByRole("button", { name: "Render scene", exact: true }).click();
  await expect(page.getByTestId("render-status")).toContainText("Scene ready");
  await page
    .getByRole("button", { name: "Play recorded scene", exact: true })
    .click();
  const before = await page.getByTestId("scene-audio").getAttribute("src");
  await page.getByRole("button", { name: "Render scene", exact: true }).click();
  await expect(page.getByTestId("scene-audio")).not.toHaveAttribute(
    "src",
    before!,
  );
  await expect(
    page.getByRole("button", { name: "Play recorded scene", exact: true }),
  ).toBeEnabled();
  expect(
    await page
      .getByTestId("scene-audio")
      .evaluate((audio: HTMLAudioElement) => audio.paused),
  ).toBe(true);
  expect(requests).toHaveLength(4);
  await page.route("**/api/voice-agent/token", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "Simulated Director offline" },
    }),
  );
  await page
    .getByRole("button", { name: "Play recorded scene", exact: true })
    .click();
  await page.getByLabel("Direction note").fill("Shorten this line.");
  await page
    .getByRole("button", { name: "Send direction", exact: true })
    .click();
  await expect(
    page.getByLabel("Director booth").getByRole("alert"),
  ).toContainText("Simulated Director offline");
  expect(
    await page
      .getByTestId("scene-audio")
      .evaluate((audio: HTMLAudioElement) => audio.paused),
  ).toBe(true);
  await expect(
    page.getByRole("button", { name: "Play recorded scene", exact: true }),
  ).toBeVisible();
});

test("editing text or voice stops and invalidates an old mix; undo allows review again", async ({
  page,
}) => {
  await simulatedProvider(page);
  await ready(page);
  await page.getByRole("button", { name: "Render scene", exact: true }).click();
  await expect(page.getByTestId("render-status")).toContainText("Scene ready");
  await page
    .getByRole("button", { name: "Play recorded scene", exact: true })
    .click();
  await page.getByLabel("Dialogue", { exact: true }).fill("A new tomorrow.");
  await expect(
    page.getByRole("button", { name: "Play recorded scene", exact: true }),
  ).toBeDisabled();
  await expect
    .poll(() =>
      page
        .getByTestId("scene-audio")
        .evaluate((audio: HTMLAudioElement) => audio.paused),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Undo scene edit" }).click();
  await expect(
    page.getByRole("button", { name: "Play recorded scene", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Play recorded scene", exact: true })
    .click();
  await page
    .getByLabel("AssemblyAI voice for Mara Venn")
    .selectOption("george");
  await expect(
    page.getByRole("button", { name: "Play recorded scene", exact: true }),
  ).toBeDisabled();
  await expect
    .poll(() =>
      page
        .getByTestId("scene-audio")
        .evaluate((audio: HTMLAudioElement) => audio.paused),
    )
    .toBe(true);
});

test("splitting long dialogue preserves exact text, cast, direction and undo history", async ({
  page,
}) => {
  await simulatedProvider(page);
  await ready(page);
  const text = "Mara—meet Zoë at 9:42. Café déjà vu? 👩🏽‍🚀 ".repeat(18);
  await page.getByLabel("Dialogue", { exact: true }).fill(text);
  const direction = await page
    .getByLabel("Performance direction", { exact: true })
    .inputValue();
  await page
    .getByRole("button", { name: "Split into renderable lines", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Split into renderable lines",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("scenevox.scene.v2")!).lines.length,
      ),
    )
    .toBe(5);
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("scenevox.scene.v2")!),
  );
  expect(
    saved.lines
      .slice(0, 2)
      .map((line: { text: string }) => line.text)
      .join(""),
  ).toBe(text);
  expect(
    saved.lines
      .slice(0, 2)
      .every(
        (line: { text: string; characterId: string; direction: string }) =>
          Array.from(line.text).length <= 500 &&
          line.characterId === "mara" &&
          line.direction === direction,
      ),
  ).toBe(true);
  expect(saved.takes.some((take: { text: string }) => take.text === text)).toBe(
    true,
  );
  await page.getByRole("button", { name: "Undo scene edit" }).click();
  await expect(page.getByLabel("Dialogue", { exact: true })).toHaveValue(text);
  await page.getByRole("button", { name: "Redo scene edit" }).click();
  await expect(
    page.getByRole("button", { name: "Generate take", exact: true }),
  ).toBeEnabled();
  await page.getByLabel("Dialogue", { exact: true }).fill("x".repeat(501));
  await page
    .getByRole("button", { name: "Split into renderable lines", exact: true })
    .click();
  await expect(
    page.getByText(/cannot be split without cutting a word/),
  ).toBeVisible();
  await expect(page.getByLabel("Dialogue", { exact: true })).toHaveValue(
    "x".repeat(501),
  );
});

test("a recorded default voice remains selected after the catalog order changes", async ({
  page,
}) => {
  const { requests } = await simulatedProvider(page);
  await ready(page);
  await generate(page);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("scenevox.scene.v2")!)
            .assemblyVoiceAssignments.mara,
      ),
    )
    .toBe("alba");
  await page.route("**/api/voice-agent/voices", (route) =>
    route.fulfill({
      json: {
        voices: [
          { id: "george", name: "George" },
          { id: "alba", name: "Alba" },
        ],
      },
    }),
  );
  await page.reload();
  await expect(page.getByLabel("AssemblyAI voice for Mara Venn")).toHaveValue(
    "alba",
  );
  await generate(page);
  expect(requests).toHaveLength(1);
});

test("simulated exact-read preserves names, punctuation, numbers and Unicode; reload, A/B, stale and WAV", async ({
  page,
}) => {
  const { requests, endings } = await simulatedProvider(page);
  await ready(page);
  const original = "Mara—Zoë says: 42 seedlings, café déjà vu. Don’t leave!";
  await page.getByLabel("Dialogue", { exact: true }).fill(original);
  await generate(page);
  await page
    .getByLabel("Dialogue", { exact: true })
    .fill("Zoë, we still have tomorrow.");
  await generate(page);
  expect(requests.map((item) => item.greeting)).toEqual([
    original,
    "Zoë, we still have tomorrow.",
  ]);
  expect(endings).toHaveLength(2);
  const panel = page.getByRole("region", { name: "Recorded performances" });
  await expect(panel.getByText("Different text / voice")).toBeVisible();
  await page.getByRole("button", { name: "Play A", exact: true }).click();
  await expect(panel.getByLabel("Recording playback")).toBeVisible();
  await page.getByRole("button", { name: "Play B", exact: true }).click();
  await expect(
    panel.getByRole("button", { name: "Stop recording", exact: true }),
  ).toHaveCount(1);
  const wav = await downloadedBytes(
    page,
    panel.getByRole("button", { name: "Download WAV", exact: true }).first(),
  );
  expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
  expect(wav.readUInt32LE(24)).toBe(24000);
  expect(wav.readUInt16LE(34)).toBe(16);
  expect(wav.length).toBe(48044);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("scenevox.scene.v2")!).takes.filter(
            (take: { audio?: unknown }) => take.audio,
          ).length,
      ),
    )
    .toBe(2);
  await page.reload();
  await expect(
    panel.getByRole("button", { name: "Replay", exact: true }),
  ).toHaveCount(2);
  // Same text and voice is cached, with no paid session.
  await generate(page);
  expect(requests).toHaveLength(2);
  await panel
    .getByRole("button", { name: "Use recorded take", exact: true })
    .last()
    .click();
  await expect(page.getByLabel("Dialogue", { exact: true })).toHaveValue(
    original,
  );
  await panel
    .getByRole("button", { name: "Delete audio", exact: true })
    .last()
    .click();
  await expect(
    panel.getByText(/Audio unavailable on this device/),
  ).toBeVisible();
  await expect(page.getByLabel("Dialogue", { exact: true })).toHaveValue(
    original,
  );
});

test("simulated multi-character scene assembly reuses audio and exports correct duration", async ({
  page,
}) => {
  const { requests, endings } = await simulatedProvider(page);
  await ready(page);
  await page.getByRole("button", { name: "Render scene", exact: true }).click();
  await expect(page.getByTestId("render-status")).toContainText(
    "Scene ready · 4.90s",
  );
  expect(requests.map((item) => item.voice)).toEqual([
    "alba",
    "george",
    "alba",
    "george",
  ]);
  expect(endings).toHaveLength(4);
  const wav = await downloadedBytes(
    page,
    page.getByRole("button", { name: "Download scene WAV", exact: true }),
  );
  expect((wav.length - 44) / 48000).toBe(4.9);
  await page.getByRole("button", { name: "Render scene", exact: true }).click();
  await expect(page.getByTestId("render-status")).toContainText("Scene ready");
  expect(requests).toHaveLength(4);
  await page
    .getByLabel("AssemblyAI voice for Mara Venn")
    .selectOption("george");
  await expect(
    page.getByRole("button", { name: "Download scene WAV", exact: true }),
  ).toBeDisabled();
});

test("simulated cancellation and duplicate clicks close once and do not save partial audio", async ({
  page,
}) => {
  const { requests, endings } = await simulatedProvider(page, "delay");
  await ready(page);
  await page
    .getByRole("button", { name: "Generate take", exact: true })
    .evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
  await expect.poll(() => requests.length).toBe(1);
  await expect(
    page.getByRole("button", { name: "Talk to Director", exact: false }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Cancel render", exact: true })
    .click();
  await expect(page.getByTestId("render-status")).toContainText(
    "Render cancelled",
  );
  expect(endings).toHaveLength(1);
  await expect(
    page.getByRole("button", { name: "Replay", exact: true }),
  ).toHaveCount(0);
});
for (const mode of ["error", "disconnect"] as const)
  test(`simulated ${mode} is recoverable`, async ({ page }) => {
    await simulatedProvider(page, mode);
    await ready(page);
    await page
      .getByRole("button", { name: "Generate take", exact: true })
      .click();
    await expect(
      page
        .getByRole("region", { name: "Recorded performances" })
        .getByRole("alert"),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Generate take", exact: true }),
    ).toBeEnabled();
  });
test("simulated timeout tears down and offers retry", async ({ page }) => {
  const { requests, endings } = await simulatedProvider(page, "timeout");
  await ready(page);
  await page.clock.install();
  await page
    .getByRole("button", { name: "Generate take", exact: true })
    .click();
  await expect.poll(() => requests.length).toBe(1);
  await page.clock.fastForward(60001);
  await expect(
    page
      .getByRole("region", { name: "Recorded performances" })
      .getByRole("alert"),
  ).toContainText("timed out");
  expect(endings).toHaveLength(1);
});
test("simulated missing timestamps, quota failure, immediate download and long-line guidance", async ({
  page,
}) => {
  await page.addInitScript(() => {
    IDBObjectStore.prototype.put = function () {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    };
  });
  await simulatedProvider(page, "no-timings");
  await ready(page);
  await generate(page);
  await expect(page.getByText(/could not be saved/)).toBeVisible();
  await page.getByRole("button", { name: "Play A", exact: true }).click();
  await expect(page.getByText(/Word timings unavailable/)).toBeVisible();
  expect(
    (
      await downloadedBytes(
        page,
        page.getByRole("button", { name: "Download WAV", exact: true }).first(),
      )
    ).length,
  ).toBeGreaterThan(44);
  await page.getByLabel("Dialogue", { exact: true }).fill("a".repeat(501));
  await expect(
    page.getByRole("button", { name: "Generate take", exact: true }),
  ).toBeDisabled();
  await expect(page.getByText(/This line has more than 500/)).toBeVisible();
  await page.reload();
  await expect(
    page.getByText(/Audio unavailable on this device/),
  ).toBeVisible();
});
test("50 MB storage cap preserves existing assets and leaves the new clip downloadable", async ({
  page,
}) => {
  await simulatedProvider(page);
  await ready(page);
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("scenevox-recordings", 1);
      request.onsuccess = () => {
        const db = request.result,
          tx = db.transaction("assets", "readwrite");
        tx.objectStore("assets").put({
          id: "quota-fixture",
          wav: new Blob([new Uint8Array(50 * 1024 * 1024)]),
          metadata: {
            voice: "fixture",
            transcript: "Existing recording preserved",
          },
        });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onabort = () => reject(tx.error);
      };
    });
  });
  await generate(page);
  await expect(page.getByText(/50 MB recording limit reached/)).toBeVisible();
  expect(
    (
      await downloadedBytes(
        page,
        page.getByRole("button", { name: "Download WAV", exact: true }).first(),
      )
    ).length,
  ).toBeGreaterThan(44);
  expect(
    await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          const req = indexedDB.open("scenevox-recordings", 1);
          req.onsuccess = () => {
            const db = req.result;
            const count = db
              .transaction("assets")
              .objectStore("assets")
              .count();
            count.onsuccess = () => {
              resolve(count.result);
              db.close();
            };
          };
        }),
    ),
  ).toBe(1);
});

test("legacy draft migrates to v2, retaining v1 backup", async ({ page }) => {
  await simulatedProvider(page);
  // Seed before application startup; a running v2 app correctly flushes its draft on pagehide.
  await page.addInitScript(() => {
    localStorage.setItem(
      "scenevox.scene.v1",
      JSON.stringify({
        version: 1,
        title: "Legacy scene",
        setting: "INT. GARDEN",
        premise: "Keep the draft.",
        characters: [
          {
            id: "mara",
            name: "Mara",
            role: "Writer",
            color: "#ff8d6b",
            voiceHint: "warm",
          },
        ],
        lines: [
          {
            id: "line-1",
            characterId: "mara",
            text: "A legacy draft.",
            direction: "quiet",
          },
        ],
        takes: [],
        voiceAssignments: {},
      }),
    );
    localStorage.removeItem("scenevox.scene.v2");
  });
  await ready(page);
  await expect(page.getByLabel("Dialogue", { exact: true })).toHaveValue(
    "A legacy draft.",
  );
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("scenevox.scene.v2") ?? "null")
            ?.version,
      ),
    )
    .toBe(2);
  expect(
    await page.evaluate(() => localStorage.getItem("scenevox.scene.v1")),
  ).not.toBeNull();
});
