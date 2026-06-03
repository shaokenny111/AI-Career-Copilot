// ============================================================================
// Gemini 客户端（client）—— 网络层 + 结构化任务运行器
// ----------------------------------------------------------------------------
// - callGeminiProxy：V1.0 已验证稳定的底层调用（统一走 Cloudflare Pages Function
//   代理 /api/gemini，API Key 只在服务端）。【网络层不改】
// - extractTextFromFile / analyzeWithGemini：V1.0 既有能力，原样保留供旧代码调用
// - runJsonTask：6 个 Prompt 任务文件共用的结构化运行器（responseJsonSchema +
//   低温 + 配额降级 + zod 二次校验 + 失败重试 1 次），见文档 2.1 / 2.2
// ============================================================================

import type { ZodType } from "zod";

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

/**
 * 底层调用：统一走 Cloudflare Pages Function 代理 (/api/gemini)。
 * 【V1.0 已验证稳定的网络层——不要改动这里的逻辑】
 */
export async function callGeminiProxy(body: GeminiRequestBody): Promise<string> {
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

/** 默认模型与降级顺序（配额受限时依次回退）。
 *  ⚠️ 旧的 gemini-1.5-flash / 1.5-pro 在当前 v1beta 已下线（404）——primary 撞 429
 *  会 fallback 到死模型、整次编译失败。改用经 ListModels 核实、当前可用的 GA 模型：
 *  gemini-3.1-flash-lite（主）→ 2.5-flash-lite → 2.5-flash（均非 preview、支持
 *  generateContent + responseJsonSchema）。 */
export const DEFAULT_MODELS = [
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
];

/** 文档 2.1：改写/分级类任务的默认低温（保证输出稳定不发散）。
 *  喂评分/差距的任务（#2/#3/#8/#9）显式传 temperature:0 求可复现（见各任务文件）；
 *  改写 #1 保留默认 0.3（需要一点创造性，且不直接喂评分）。 */
const STRUCTURED_TEMPERATURE = 0.3;

function isQuotaError(error: unknown): boolean {
  const msg = ((error as any)?.message || "").toLowerCase();
  return (
    msg.includes("quota") ||
    msg.includes("429") ||
    (error as any)?.status === 429
  );
}

/**
 * 核心分析功能（V1.0 既有，供旧 App.tsx 调用，原样保留）。
 */
export async function analyzeWithGemini(
  prompt: string,
  modelNames: string[] = DEFAULT_MODELS,
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
      if (!isQuotaError(error)) {
        // 非配额问题说明是其它故障，立即失败
        throw error;
      }
      console.log(
        `[Gemini Info] Retrying with the next model due to quota limit on ${model}...`,
      );
    }
  }

  console.error("[Gemini Error] All fallback models failed.");
  throw lastError;
}

/**
 * 核心解析功能：直接从文件（PDF/图片）中提取文字（OCR）。
 * V1.0 既有能力，被 lib/fileParser 复用，原样保留。
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

/** 带配额降级的结构化 JSON 调用：附带 responseJsonSchema 与温度配置 */
async function callStructured(
  prompt: string,
  responseJsonSchema: Record<string, unknown>,
  modelNames: string[],
  temperature: number,
): Promise<string> {
  let lastError: unknown;
  for (const model of modelNames) {
    try {
      return await callGeminiProxy({
        model,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature,
          responseMimeType: "application/json",
          responseJsonSchema,
        },
      });
    } catch (error) {
      lastError = error;
      if (!isQuotaError(error)) throw error; // 非配额错误立即失败
    }
  }
  throw lastError;
}

/**
 * 6 个 Prompt 任务共用的结构化运行器。
 *
 * 流程（文档 2.2 通用错误处理）：
 *   调用（带 responseJsonSchema + 低温 + 配额降级）→ JSON.parse → zod 校验
 *   任一步失败 → 整体重试 1 次（共尝试 2 次）→ 仍失败则抛出最后一次错误
 *
 * 返回值是【zod 校验后的原始 AI 输出】（snake_case）。各任务文件负责把它
 * 映射成 types.ts 中的 camelCase 契约类型。
 */
export async function runJsonTask<T>(params: {
  prompt: string;
  responseJsonSchema: Record<string, unknown>;
  schema: ZodType<T>;
  modelNames?: string[];
  /** 采样温度。默认 0.3；喂评分/差距的任务（#2/#3/#8/#9）传 0 求可复现。 */
  temperature?: number;
}): Promise<T> {
  const {
    prompt,
    responseJsonSchema,
    schema,
    modelNames = DEFAULT_MODELS,
    temperature = STRUCTURED_TEMPERATURE,
  } = params;

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await callStructured(prompt, responseJsonSchema, modelNames, temperature);
      return schema.parse(JSON.parse(raw));
    } catch (error) {
      lastError = error;
      console.warn(`[Gemini] structured task attempt ${attempt + 1} failed`, error);
    }
  }
  throw lastError;
}
