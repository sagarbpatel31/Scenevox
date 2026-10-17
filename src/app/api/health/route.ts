export async function GET() {
  return Response.json({
    ok: true,
    product: "SceneVox",
    agentEndpoint: "wss://agents.assemblyai.com/v1/ws",
    standaloneTtsEndpoint: "wss://streaming-tts.assemblyai.com/v1/ws",
    provider: process.env.ASSEMBLYAI_API_KEY ? "assemblyai-ready" : "browser-preview",
    protocolStatus: "voice-agent-api-ready",
  });
}
