import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
function route(path, fetcher, key = "simulated-server-secret") {
  const code = ts.transpileModule(
    readFileSync(new URL(path, import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText;
  const exports = {};
  new Function("exports", "process", "fetch", code)(
    exports,
    { env: { ASSEMBLYAI_API_KEY: key } },
    fetcher,
  );
  return exports;
}
test("render tokens are capped at 60 seconds; legacy Director remains 300; key never returned", async () => {
  const durations = [];
  const { POST } = route(
    "../src/app/api/voice-agent/token/route.ts",
    async (url, options) => {
      durations.push(url.searchParams.get("max_session_duration_seconds"));
      assert.equal(
        options.headers.Authorization,
        "Bearer simulated-server-secret",
      );
      return Response.json({ token: "single-use-test-token" });
    },
  );
  for (const body of [
    JSON.stringify({ purpose: "render" }),
    "",
    JSON.stringify({ purpose: "director" }),
  ]) {
    const response = await POST(
      new Request("http://localhost/api/voice-agent/token", {
        method: "POST",
        body,
      }),
    );
    const text = await response.text();
    assert.equal(response.status, 200);
    assert.ok(!text.includes("simulated-server-secret"));
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  assert.deepEqual(durations, ["60", "300", "300"]);
});
test("invalid purposes and cross-origin requests cannot mint tokens", async () => {
  const { POST } = route("../src/app/api/voice-agent/token/route.ts", () => {
    throw new Error("Must not call provider");
  });
  for (const body of ['{"purpose":"unlimited"}', "null", "invalid-json"])
    assert.equal(
      (
        await POST(
          new Request("http://localhost/api/token", { method: "POST", body }),
        )
      ).status,
      400,
    );
  assert.equal(
    (
      await POST(
        new Request("http://localhost/api/token", {
          method: "POST",
          headers: { origin: "https://attacker.example", host: "localhost" },
        }),
      )
    ).status,
    403,
  );
});
test("voice route sanitizes live catalog and explicitly labels documented fallback", async () => {
  const path = "../src/app/api/voice-agent/voices/route.ts";
  const { GET } = route(path, async () =>
    Response.json({
      voices: [{ id: "alba", name: "Alba", secret: "never expose" }, null],
    }),
  );
  assert.deepEqual(await (await GET()).json(), {
    voices: [{ id: "alba", name: "Alba" }],
    source: "live",
  });
  const fallback = await (
    await route(
      path,
      async () => new Response("Unavailable", { status: 426 }),
    ).GET()
  ).json();
  assert.equal(fallback.source, "documented-fallback");
  assert.ok(fallback.warning);
  assert.ok(fallback.voices.length);
});
