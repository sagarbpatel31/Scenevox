import { expect, test, type Page } from "@playwright/test";

const browserErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByText("Saved on this device")).toBeVisible();
});

test.afterEach(async ({ page }) => {
  expect(
    browserErrors.get(page) ?? [],
    "No uncaught browser exceptions",
  ).toEqual([]);
});

test("stopping scene playback and previewing a line cannot resume the old scene", async ({
  page,
}) => {
  await page.evaluate(() => {
    const instrumented = window as unknown as { spoken: string[] };
    instrumented.spoken = [];
    window.speechSynthesis.speak = (utterance) => {
      instrumented.spoken.push(utterance.text);
      utterance.onstart?.(new Event("start") as SpeechSynthesisEvent);
      if (instrumented.spoken.length > 1)
        setTimeout(
          () => utterance.onend?.(new Event("end") as SpeechSynthesisEvent),
          100,
        );
    };
    window.speechSynthesis.cancel = () => {};
  });
  await page.getByRole("button", { name: "Play scene", exact: false }).click();
  await page.getByRole("button", { name: "Stop", exact: false }).click();
  await page.getByRole("button", { name: "Select line 3: Mara Venn" }).click();
  await page
    .getByRole("button", { name: "Preview selected line", exact: true })
    .click();
  await expect(page.getByText("Read complete", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as { spoken: string[] }).spoken,
    ),
  ).toEqual([
    "Orion, dim every light except the garden ring.",
    "Then let them think morning is still coming.",
  ]);
});

test("a malformed share link does not overwrite the saved scene", async ({
  page,
}) => {
  await page
    .getByLabel("Dialogue", { exact: true })
    .fill("Keep this draft safe.");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("scenevox.scene.v1")!).lines[0].text,
      ),
    )
    .toBe("Keep this draft safe.");
  await page.goto("/#scene=not-valid-json");
  await expect(page.getByLabel("Dialogue", { exact: true })).toHaveValue(
    "Keep this draft safe.",
  );
});

test("edits survive refresh, and undo/redo restores the document", async ({
  page,
}) => {
  await page
    .getByLabel("Scene title", { exact: true })
    .fill("The next morning");
  await page
    .getByLabel("Dialogue", { exact: true })
    .fill("We still have tomorrow.");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("scenevox.scene.v1")!).lines[0].text,
      ),
    )
    .toBe("We still have tomorrow.");
  await page.reload();
  await expect(page.getByLabel("Scene title", { exact: true })).toHaveValue(
    "The next morning",
  );
  await expect(page.getByLabel("Dialogue", { exact: true })).toHaveValue(
    "We still have tomorrow.",
  );
  await page
    .getByLabel("Dialogue", { exact: true })
    .fill("An alternate ending.");
  await page.getByRole("button", { name: "Undo scene edit" }).click();
  await expect(page.getByLabel("Dialogue", { exact: true })).toHaveValue(
    "We still have tomorrow.",
  );
  await page.getByRole("button", { name: "Redo scene edit" }).click();
  await expect(page.getByLabel("Dialogue", { exact: true })).toHaveValue(
    "An alternate ending.",
  );
});

test("imports a script, detects three characters, and saves and restores takes", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Import script", exact: false })
    .click();
  await page
    .getByLabel("Scene title", { exact: true })
    .last()
    .fill("The return");
  await page
    .getByLabel("Script", { exact: true })
    .fill(
      "AVA: (whispering) Are you there?\nBEN: Always.\nCORA: Not for long.",
    );
  await page
    .getByRole("button", { name: "Import script", exact: false })
    .last()
    .click();
  await expect(page.getByText("3 roles", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Select line 3: CORA" }),
  ).toBeVisible();
  await page.getByLabel("Dialogue", { exact: true }).fill("Stay with me.");
  await page.getByRole("button", { name: "Save take", exact: false }).click();
  await page.getByRole("tab", { name: "Takes", exact: false }).click();
  await expect(
    page.getByLabel("Saved takes").getByText("Stay with me.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Use this take", exact: false })
    .last()
    .click();
  await page.getByRole("tab", { name: "Direction", exact: true }).click();
  await expect(page.getByLabel("Dialogue", { exact: true })).toHaveValue(
    "Are you there?",
  );
  await expect(page.getByLabel("Performance direction")).toHaveValue(
    "whispering",
  );
});

test("shared links restore the actual scene in a new browser context", async ({
  page,
  browser,
}) => {
  await page
    .getByLabel("Dialogue", { exact: true })
    .fill("Café on the moon — tomorrow.");
  await page.getByRole("button", { name: "Share scene", exact: false }).click();
  await expect(
    page.getByText("Scene snapshot link copied", { exact: false }),
  ).toBeVisible();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toContain("#scene=");
  const context = await browser.newContext();
  const other = await context.newPage();
  await other.goto(link);
  await expect(other.getByLabel("Dialogue", { exact: true })).toHaveValue(
    "Café on the moon — tomorrow.",
  );
  await context.close();
});

test("exports a portable scene and rejects invalid imported JSON", async ({
  page,
}) => {
  await page.getByText("Export ↓", { exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Scene + takes (.json)", exact: true })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("the-last-garden.scenevox.json");
  await page
    .getByRole("button", { name: "Import script", exact: false })
    .click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"version":1,"lines":[]}'),
  });
  await expect(page.getByRole("dialog").getByRole("alert")).toHaveText(
    "This scene file has an unsupported format.",
  );
  await page.getByRole("button", { name: "Close import" }).click();
  await expect(page.getByLabel("Scene title", { exact: true })).toHaveValue(
    "The Last Garden",
  );
});

test("mobile fits the viewport and exposes scene tools and Director", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.getByRole("button", { name: "Import script", exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Talk to Director", exact: false })
    .scrollIntoViewIfNeeded();
  await expect(page.getByLabel("Direction note")).toBeVisible();
});

test("microphone rejection is recoverable and does not request a paid token", async ({
  page,
}) => {
  let tokenRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/voice-agent/token")) tokenRequests++;
  });
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException(
        "Microphone permission was denied",
        "NotAllowedError",
      );
    };
  });
  await page
    .getByRole("button", { name: "Talk to Director", exact: false })
    .click();
  await expect(
    page.getByLabel("Director booth").getByRole("alert"),
  ).toContainText("denied");
  await expect(
    page.getByRole("button", { name: "Talk to Director", exact: false }),
  ).toBeEnabled();
  expect(tokenRequests).toBe(0);
});

test("ending during microphone permission setup does not open a late session", async ({
  page,
}) => {
  let tokenRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/voice-agent/token")) tokenRequests++;
  });
  await page.evaluate(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      await new Promise((resolve) => setTimeout(resolve, 900));
      return original(constraints);
    };
  });
  await page
    .getByRole("button", { name: "Talk to Director", exact: false })
    .click();
  await page.getByRole("button", { name: "End session", exact: false }).click();
  await expect(
    page.getByRole("button", { name: "Talk to Director", exact: false }),
  ).toBeEnabled();
  await page.waitForTimeout(1_200);
  expect(tokenRequests).toBe(0);
});

test("@live prerecorded voice reaches AssemblyAI, returns audio, revises a line, and ends cleanly", async ({
  page,
}) => {
  test.skip(
    !process.env.SCENEVOX_LIVE_TESTS || !process.env.SCENEVOX_TEST_AUDIO,
    "Opt-in: uses a brief real AssemblyAI session and synthesized test speech.",
  );
  test.setTimeout(80_000);
  const events: string[] = [];
  page.on("websocket", (socket) => {
    if (!socket.url().startsWith("wss://agents.assemblyai.com")) return;
    socket.on("framereceived", (frame) => {
      const event = JSON.parse(frame.payload.toString());
      events.push(event.type);
    });
  });
  await page.getByRole("button", { name: "Select line 3: Mara Venn" }).click();
  await page
    .getByRole("button", { name: "Talk to Director", exact: false })
    .click();
  try {
    await expect(page.getByLabel("Dialogue", { exact: true })).toHaveValue(
      /We still have tomorrow\.?/i,
      { timeout: 60_000 },
    );
    await expect(page.getByText(/revision saved to takes/)).toBeVisible();
    expect(events).toContain("session.ready");
    expect(events).toContain("transcript.user");
    expect(events).toContain("reply.audio");
    expect(events).toContain("tool.call");
    await page.getByRole("tab", { name: "Takes", exact: false }).click();
    await expect(
      page.getByLabel("Saved takes").getByText(/We still have tomorrow\.?/i),
    ).toBeVisible();
  } finally {
    const end = page.getByRole("button", { name: "End session", exact: false });
    if (await end.isVisible()) await end.click();
    await expect
      .poll(() => events.includes("session.ended"), { timeout: 5_000 })
      .toBe(true);
  }
  console.log("Verified live events:", [...new Set(events)].join(", "));
});

test("@live typed direction follows selection changes in the same session", async ({
  page,
}) => {
  test.skip(
    !process.env.SCENEVOX_LIVE_TESTS,
    "Opt-in: uses a brief real AssemblyAI session.",
  );
  test.setTimeout(70_000);
  const ended: string[] = [];
  page.on("websocket", (socket) => {
    if (!socket.url().startsWith("wss://agents.assemblyai.com")) return;
    socket.on("framereceived", (frame) => {
      const event = JSON.parse(frame.payload.toString());
      if (event.type === "session.ended") ended.push(event.type);
    });
  });
  await page
    .getByLabel("Direction note")
    .fill(
      'Replace the selected dialogue with exactly "Stay with me." Set the direction to "quiet urgency". Apply the revision.',
    );
  await page
    .getByRole("button", { name: "Send direction", exact: true })
    .click();
  try {
    await expect(page.getByLabel("Dialogue", { exact: true })).toHaveValue(
      "Stay with me.",
      { timeout: 30_000 },
    );
    await expect(
      page.getByText("Listening to you", { exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Select line 2: Orion" }).click();
    await page
      .getByLabel("Direction note")
      .fill(
        'Replace the selected dialogue with exactly "The sun is ours." Set the direction to "gentle, precise". Apply it now.',
      );
    await page
      .getByRole("button", { name: "Send direction", exact: true })
      .click();
    await expect(page.getByLabel("Dialogue", { exact: true })).toHaveValue(
      "The sun is ours.",
      { timeout: 30_000 },
    );
    await page
      .getByRole("button", { name: "Select line 1: Mara Venn" })
      .click();
    await expect(page.getByLabel("Dialogue", { exact: true })).toHaveValue(
      "Stay with me.",
    );
  } finally {
    const end = page.getByRole("button", { name: "End session", exact: false });
    if (await end.isVisible()) await end.click();
    await expect.poll(() => ended.length, { timeout: 5_000 }).toBe(1);
  }
});
