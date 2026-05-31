// ============================================================================
// 文件解析层（fileParser）
// ----------------------------------------------------------------------------
// 从 V1.0 的 InputSection.tsx 抽出的文件解析能力，整理成无 UI 依赖的纯函数模块。
// 解析策略与 V1.0 完全一致（已验证可用），本文件只做抽取与整理，不改解析逻辑：
//   - .docx / Word：本地用 mammoth 提取纯文本（不走网络）
//   - PDF / 图片 / 文本：读成 base64 后交给 Gemini OCR（extractTextFromFile）
//   - 剪贴板 / 拖入的图片：同样走 Gemini OCR
//
// 网络层（OCR 实际调用）仍由 lib/gemini 提供，本文件只负责"读文件 → 决定走哪条解析路径"。
// ============================================================================

import mammoth from "mammoth";
import { extractTextFromFile } from "./gemini";

/** .docx 的标准 MIME 类型 */
const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** PDF/图片在浏览器拿不到 MIME 时的兜底类型（沿用 V1.0 行为） */
const FALLBACK_MIME = "application/pdf";

/**
 * 把 File / Blob 读成【不带 data URL 前缀】的纯 base64 字符串。
 * （Gemini inlineData 需要的是去掉 "data:<mime>;base64," 前缀后的部分）
 */
export function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]); // 去掉 data:<mime>;base64, 前缀
    };
    reader.onerror = (error) => reject(error);
  });
}

/** 判断是否为 Word 文档（按扩展名或 MIME 双重判断，沿用 V1.0 逻辑） */
function isWordDoc(file: File): boolean {
  return (
    file.name.toLowerCase().endsWith(".docx") || file.type === DOCX_MIME
  );
}

/**
 * 解析上传的简历 / JD 文件，返回提取出的纯文本。
 * - Word(.docx) → mammoth 本地解析
 * - 其余（PDF / 图片 / 文本）→ Gemini OCR
 *
 * 解析失败由底层抛出，交给调用方处理 UI 提示。
 */
export async function parseFile(file: File): Promise<string> {
  if (isWordDoc(file)) {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  }

  const base64 = await fileToBase64(file);
  return extractTextFromFile(base64, file.type || FALLBACK_MIME);
}

/**
 * 解析剪贴板 / 拖入的图片 Blob，返回 OCR 文本。
 * 用于"粘贴图片识别"场景（剪贴板里是图片而非文字时）。
 */
export async function parseImageBlob(blob: Blob): Promise<string> {
  const base64 = await fileToBase64(blob);
  return extractTextFromFile(base64, blob.type);
}

/**
 * 从一次原生 paste 事件中提取首个图片 Blob（没有图片则返回 null）。
 * 配合全局 paste 监听使用——浏览器在 iframe 等环境下禁用 clipboard.read()，
 * 监听 paste 事件读取 clipboardData 是 V1.0 验证可用的兜底方案。
 */
export function getPastedImage(e: ClipboardEvent): Blob | null {
  const items = e.clipboardData?.items;
  if (!items) return null;

  for (const item of items) {
    if (item.type.startsWith("image/")) {
      const blob = item.getAsFile();
      if (blob) return blob;
    }
  }
  return null;
}

/**
 * 主动读取剪贴板里的首个图片（点击"粘贴"按钮时用）。
 * 通过 navigator.clipboard.read() 读取；无图片或读取被拒时返回 null，
 * 由调用方决定是否回退到 readText()。
 */
export async function readClipboardImage(): Promise<Blob | null> {
  const items = await navigator.clipboard.read().catch(() => null);
  if (!items) return null;

  for (const item of items) {
    const imageType = item.types.find((t) => t.startsWith("image/"));
    if (imageType) {
      return await item.getType(imageType);
    }
  }
  return null;
}
