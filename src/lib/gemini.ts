/**
 * Gemini 调用统一走 Cloudflare Pages Function 代理 (/api/gemini)。
 * API Key 仅存在于服务端 (Cloudflare 环境变量 GEMINI_API_KEY)，不会暴露到浏览器。
 */

interface GeminiPart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
}

interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

interface GeminiRequestBody {
  model: string;
  contents: GeminiContent[];
  generationConfig?: Record<string, unknown>;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: GeminiPart[];
      role?: string;
    };
    finishReason?: string;
  }>;
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
  promptFeedback?: {
    blockReason?: string;
  };
}

async function callGeminiProxy(body: GeminiRequestBody): Promise<string> {
  const res = await fetch("/api/gemini", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const rawText = await res.text();
  let parsed: GeminiResponse | { error?: string } | null = null;
  try {
    parsed = rawText ? (JSON.parse(rawText) as GeminiResponse) : null;
  } catch {
    parsed = null;
  }

  if (!res.ok) {
    const proxyError =
      parsed && typeof (parsed as any).error === "string"
        ? (parsed as any).error
        : undefined;
    const upstreamError =
      parsed && (parsed as GeminiResponse).error?.message
        ? (parsed as GeminiResponse).error!.message
        : undefined;
    const message =
      proxyError ||
      upstreamError ||
      rawText ||
      `Request failed with status ${res.status}`;
    const err = new Error(`[${res.status}] ${message}`);
    (err as any).status = res.status;
    throw err;
  }

  const data = parsed as GeminiResponse | null;
  if (!data) {
    throw new Error("AI 返回了空数据");
  }
  if (data.error?.message) {
    throw new Error(data.error.message);
  }
  if (data.promptFeedback?.blockReason) {
    throw new Error(`Request blocked: ${data.promptFeedback.blockReason}`);
  }

  const text = data.candidates
    ?.flatMap((c) => c.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("")
    .trim();

  if (!text) throw new Error("AI 返回了空数据");
  return text;
}

/**
 * 核心分析功能：用于简历与 JD 的匹配分析
 */
export async function analyzeWithGemini(
  prompt: string,
  modelNames: string[] = [
    "gemini-3.1-flash-lite",
    "gemini-1.5-flash",
    "gemini-1.5-pro",
  ],
) {
  let lastError: any;

  for (const model of modelNames) {
    try {
      console.log(`[Gemini] Appying analysis with model: ${model}`);
      return await callGeminiProxy({
        model,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
        },
      });
    } catch (error: any) {
      console.warn(`[Gemini Error specifically for ${model}]`, error);
      lastError = error;

      const msg = (error?.message || "").toLowerCase();
      const isQuotaError =
        msg.includes("quota") ||
        msg.includes("429") ||
        error?.status === 429;
      if (!isQuotaError) {
        // If it's not a quota issue, something else went wrong, fail immediately
        throw error;
      }
      // Otherwise, it was a quota issue, so we log and let it continue to the next model
      console.log(
        `[Gemini Info] Retrying with the next model due to quota limit on ${model}...`,
      );
    }
  }

  console.error("[Gemini Error] All fallback models failed.");
  throw lastError;
}

/**
 * 核心解析功能：直接从文件（PDF/图片）中提取文字
 */
export async function extractTextFromFile(fileData: string, mimeType: string) {
  try {
    return await callGeminiProxy({
      model: "gemini-3.1-flash-lite",
      contents: [
        {
          role: "user",
          parts: [
            {
              text: "你是一位专业的文档解析助手。请提取此文件中的所有文字内容。保持原有的信息结构（如个人信息、工作经历、技能等分段）。如果是简历，请务必保留关键的日期、公司名和项目细节。直接返回文字内容，不要输出任何开场白或解释。",
            },
            { inlineData: { mimeType, data: fileData } },
          ],
        },
      ],
    });
  } catch (error: any) {
    console.error("[Gemini OCR Error]", error);
    throw error;
  }
}
