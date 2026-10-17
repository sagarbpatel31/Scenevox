export async function GET() {
  return Response.json({
    ok: true,
    product: "SceneVox",
    ttsEndpoint: "wss://streaming-tts.assemblyai.com/v1/ws",
    provider: process.env.ASSEMBLYAI_API_KEY ? "assemblyai-ready" : "browser-preview",
  });
}
