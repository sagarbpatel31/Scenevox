import { expect, test } from "@playwright/test";
test("@live exact greetings produce recorded audio, two voices, replay and WAV export", async ({
  page,
}, testInfo) => {
  test.skip(
    !process.env.SCENEVOX_LIVE_TESTS,
    "Opt-in real AssemblyAI API test; consumes credits.",
  );
  test.setTimeout(180_000);
  const errors: string[] = [],
    events: string[] = [],
    sent: { text: string; voice: string }[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("websocket", (socket) => {
    if (!socket.url().startsWith("wss://agents.assemblyai.com")) return;
    socket.on("framesent", ({ payload }) => {
      const e = JSON.parse(payload.toString());
      if (e.type === "session.update")
        sent.push({ text: e.session.greeting, voice: e.session.output.voice });
    });
    socket.on("framereceived", ({ payload }) => {
      const e = JSON.parse(payload.toString());
      events.push(e.type);
    });
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Generate take", exact: true }),
  ).toBeEnabled({ timeout: 20_000 });
  await page.getByLabel("AssemblyAI voice for Orion").selectOption("george");
  const lines = [
    "Mara, meet Zoë at 9:42. Café déjà vu?",
    "Orion—keep all 42 seedlings safe!",
    "Don’t leave, Élodie. We have tomorrow.",
  ];
  const voices = ["alba", "george", "alba"];
  for (let i = 0; i < lines.length; i++) {
    await page
      .getByLabel("AssemblyAI voice for Mara Venn")
      .selectOption(voices[i]);
    await page.getByLabel("Dialogue", { exact: true }).fill(lines[i]);
    await page
      .getByRole("button", { name: "Generate take", exact: true })
      .click();
    await expect(page.getByTestId("render-status")).toContainText(
      "Take ready",
      { timeout: 65_000 },
    );
  }
  expect(sent).toEqual(lines.map((text, i) => ({ text, voice: voices[i] })));
  expect(events.filter((type) => type === "session.ended")).toHaveLength(
    lines.length,
  );
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("scenevox.scene.v2")!).takes.filter(
            (take: { audio?: unknown }) => take.audio,
          ).length,
      ),
    )
    .toBe(3);
  const metadata = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("scenevox.scene.v2")!)
      .takes.filter((take: { audio?: unknown }) => take.audio)
      .map((take: { text: string; audio: unknown }) => ({
        text: take.text,
        audio: take.audio,
      })),
  );
  // Greeting bypasses the LLM. Assert provider transcript preserves exact characters too.
  expect(
    metadata.map(
      (take: { audio: { transcript: string } }) => take.audio.transcript,
    ),
  ).toEqual(lines);
  for (const take of metadata) {
    expect(take.audio.duration).toBeGreaterThan(0);
    expect(take.audio.firstAudioMs).toBeGreaterThan(0);
    expect(take.audio.endedCleanly).toBe(true);
  }
  await page.getByRole("button", { name: "Play A", exact: true }).click();
  await expect(page.getByLabel("Recording playback")).toBeVisible();
  await page.getByRole("button", { name: "Play B", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download WAV", exact: true })
    .first()
    .click();
  const download = await downloadPromise,
    stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const bytes = Buffer.concat(chunks);
  expect(bytes.toString("ascii", 0, 4)).toBe("RIFF");
  expect(bytes.readUInt32LE(24)).toBe(24000);
  expect(bytes.readUInt16LE(22)).toBe(1);
  expect(bytes.readUInt16LE(34)).toBe(16);
  expect(bytes.length).toBeGreaterThan(44);
  await page.getByRole("button", { name: "Render scene", exact: true }).click();
  await expect(page.getByTestId("render-status")).toContainText("Scene ready", {
    timeout: 65_000,
  });
  const sceneDownloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download scene WAV", exact: true })
    .click();
  const sceneStream = await (await sceneDownloadPromise).createReadStream();
  const sceneChunks: Buffer[] = [];
  for await (const chunk of sceneStream!) sceneChunks.push(Buffer.from(chunk));
  const sceneBytes = Buffer.concat(sceneChunks);
  expect(sceneBytes.toString("ascii", 0, 4)).toBe("RIFF");
  expect(sent).toHaveLength(6); // Current line reused, only three missing lines generated.
  expect(events.filter((type) => type === "session.ended")).toHaveLength(6);
  expect(sent.slice(3).map((item) => item.voice)).toEqual([
    "george",
    "alba",
    "george",
  ]);
  // The exported WAV is ready before the document's 300 ms autosave debounce.
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("scenevox.scene.v2")!).takes.filter(
            (take: { audio?: unknown }) => take.audio,
          ).length,
      ),
    )
    .toBe(6);
  const sceneDuration = await page.evaluate(() => {
    const scene = JSON.parse(localStorage.getItem("scenevox.scene.v2")!);
    return (
      scene.lines.reduce(
        (sum: number, line: { id: string; text: string }) =>
          sum +
          scene.takes.find(
            (take: {
              lineId: string;
              text: string;
              audio?: { duration: number };
            }) =>
              take.lineId === line.id && take.text === line.text && take.audio,
          ).audio.duration,
        0,
      ) +
      (scene.lines.length - 1) * 0.3
    );
  });
  expect((sceneBytes.length - 44) / 48000).toBeCloseTo(sceneDuration, 5);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Replay", exact: true }),
  ).toHaveCount(3);
  expect(errors).toEqual([]);
  await testInfo.attach("live-recording-measurements", {
    body: JSON.stringify(
      {
        environment: {
          browser: "Chromium/Chrome",
          platform: process.platform,
          input: "no microphone",
        },
        metadata,
      },
      null,
      2,
    ),
    contentType: "application/json",
  });
  console.log("Live recording measurements:", JSON.stringify(metadata));
});
