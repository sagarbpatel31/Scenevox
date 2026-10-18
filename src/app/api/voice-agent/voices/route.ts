export const dynamic = "force-dynamic";
// Official roster fallback, never presented as a successful live-catalog response.
const documentedVoices = [
  "alba",
  "eve",
  "george",
  "jane",
  "jean",
  "mary",
  "michael",
  "anna",
  "charles",
  "paul",
  "vera",
  "giovanni",
  "lola",
  "juergen",
  "rafael",
  "estelle",
].map((id) => ({ id, name: id[0].toUpperCase() + id.slice(1) }));
export async function GET() {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey)
    return Response.json(
      { error: "AssemblyAI is not configured on this server." },
      { status: 503 },
    );
  try {
    const response = await fetch("https://agents.assemblyai.com/v1/voices", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!response.ok) throw new Error();
    const body = await response.json();
    const items = Array.isArray(body) ? body : body.voices;
    if (!Array.isArray(items)) throw new Error();
    const voices = items.flatMap((item) => {
      if (typeof item === "string" && /^[a-zA-Z0-9_-]{1,120}$/.test(item))
        return [{ id: item, name: item }];
      const id = item?.id ?? item?.voice_id ?? item?.name;
      if (typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,120}$/.test(id))
        return [];
      return [{ id, name: typeof item.name === "string" ? item.name : id }];
    });
    if (!voices.length) throw new Error();
    return Response.json(
      { voices, source: "live" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      {
        voices: documentedVoices,
        source: "documented-fallback",
        warning:
          "Live voice catalog unavailable. Showing AssemblyAI’s documented roster; retry to refresh.",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
}
