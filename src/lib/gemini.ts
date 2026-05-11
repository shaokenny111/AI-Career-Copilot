import { GoogleGenAI } from "@google/genai";

let aiInstance: GoogleGenAI | null = null;

export function getAI() {
  if (!aiInstance) {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      console.error("[Gemini] API Key missing in environment");
    }
    aiInstance = new GoogleGenAI({ apiKey: apiKey || "" });
  }
  return aiInstance;
}

/**
 * 核心分析功能：用于简历与 JD 的匹配分析
 */
export async function analyzeWithGemini(prompt: string, modelNames: string[] = ["gemini-3.1-flash-lite", "gemini-1.5-flash", "gemini-1.5-pro"]) {
  const ai = getAI();
  let lastError: any;
  
  for (const model of modelNames) {
    try {
      console.log(`[Gemini] Appying analysis with model: ${model}`);
      const response = await ai.models.generateContent({
        model: model,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: {
          responseMimeType: "application/json",
        }
      });

      const text = response.text;

      if (!text) throw new Error("AI 返回了空数据");
      return text;
    } catch (error: any) {
      console.warn(`[Gemini Error specifically for ${model}]`, error);
      lastError = error;
      
      const isQuotaError = error?.message?.toLowerCase().includes("quota") || error?.message?.toLowerCase().includes("429");
      if (!isQuotaError) {
        // If it's not a quota issue, something else went wrong, fail immediately
        throw error;
      }
      // Otherwise, it was a quota issue, so we log and let it continue to the next model
      console.log(`[Gemini Info] Retrying with the next model due to quota limit on ${model}...`);
    }
  }
  
  console.error("[Gemini Error] All fallback models failed.");
  throw lastError;
}

/**
 * 核心解析功能：直接从文件（PDF/图片）中提取文字
 */
export async function extractTextFromFile(fileData: string, mimeType: string) {
  const ai = getAI();
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: [
        {
          role: "user",
          parts: [
            { text: "你是一位专业的文档解析助手。请提取此文件中的所有文字内容。保持原有的信息结构（如个人信息、工作经历、技能等分段）。如果是简历，请务必保留关键的日期、公司名和项目细节。直接返回文字内容，不要输出任何开场白或解释。" },
            { inlineData: { mimeType, data: fileData } }
          ]
        }
      ]
    });

    const text = response.text;
    if (!text) throw new Error("未能从文件中提取出文字内容");
    return text;
  } catch (error: any) {
    console.error("[Gemini OCR Error]", error);
    throw error;
  }
}
