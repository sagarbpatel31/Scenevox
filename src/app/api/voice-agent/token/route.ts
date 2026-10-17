const TOKEN_TTL_SECONDS = 60;
const MAX_SESSION_DURATION_SECONDS = 300;

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "AssemblyAI is not configured on this server." },
      { status: 503 },
    );
  }

  const origin = request.headers.get("origin");
  const requestHost =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (origin && requestHost) {
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      return Response.json({ error: "Invalid origin." }, { status: 403 });
    }
    if (originHost !== requestHost) {
      return Response.json(
        { error: "Cross-origin token requests are not allowed." },
        { status: 403 },
      );
    }
  }

  const tokenUrl = new URL("https://agents.assemblyai.com/v1/token");
  tokenUrl.searchParams.set("expires_in_seconds", String(TOKEN_TTL_SECONDS));
  tokenUrl.searchParams.set(
    "max_session_duration_seconds",
    String(MAX_SESSION_DURATION_SECONDS),
  );

  let response: Response;
  try {
    response = await fetch(tokenUrl, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return Response.json(
      { error: "AssemblyAI is temporarily unreachable. Please try again." },
      { status: 502 },
    );
  }

  if (!response.ok) {
    return Response.json(
      { error: "AssemblyAI could not start a voice session." },
      { status: response.status >= 500 ? 502 : response.status },
    );
  }

  const payload = (await response.json()) as { token?: string };
  if (!payload.token) {
    return Response.json(
      { error: "AssemblyAI returned an invalid token response." },
      { status: 502 },
    );
  }

  return Response.json(
    {
      token: payload.token,
      expiresInSeconds: TOKEN_TTL_SECONDS,
      maxSessionDurationSeconds: MAX_SESSION_DURATION_SECONDS,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
