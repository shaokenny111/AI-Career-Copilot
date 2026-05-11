interface Env {
  GEMINI_API_KEY: string;
}

interface ProxyBody {
  model?: string;
  contents?: unknown;
  generationConfig?: unknown;
  systemInstruction?: unknown;
  safetySettings?: unknown;
  tools?: unknown;
  toolConfig?: unknown;
}

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export async function onRequestPost(context: {
  request: Request;
  env: Env;
}): Promise<Response> {
  const { request, env } = context;

  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    return jsonResponse(
      {
        error:
          "Server misconfigured: GEMINI_API_KEY environment variable is missing in Cloudflare Pages.",
      },
      500,
    );
  }

  let body: ProxyBody;
  try {
    body = (await request.json()) as ProxyBody;
  } catch {
    return jsonResponse({ error: "Invalid JSON request body." }, 400);
  }

  const { model, contents, ...rest } = body;
  if (!model || typeof model !== "string") {
    return jsonResponse({ error: "Missing required field: model." }, 400);
  }
  if (!contents) {
    return jsonResponse({ error: "Missing required field: contents." }, 400);
  }

  const url = `${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents, ...rest }),
    });
  } catch (err) {
    return jsonResponse(
      {
        error: `Failed to reach Gemini API: ${err instanceof Error ? err.message : String(err)}`,
      },
      502,
    );
  }

  const text = await upstream.text();
  const contentType =
    upstream.headers.get("Content-Type") ?? "application/json; charset=utf-8";

  return new Response(text, {
    status: upstream.status,
    headers: { "Content-Type": contentType },
  });
}

export async function onRequest(context: {
  request: Request;
  env: Env;
}): Promise<Response> {
  if (context.request.method !== "POST") {
    return jsonResponse(
      { error: "Method not allowed. Use POST." },
      405,
    );
  }
  return onRequestPost(context);
}
