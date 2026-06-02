// ============================================================================
// Gemini 模块统一出口
// ----------------------------------------------------------------------------
// - 网络层 + 既有能力（callGeminiProxy / analyzeWithGemini / extractTextFromFile）
//   从 client 再导出，保持 V1.0 旧代码（App.tsx、fileParser）的 import 路径不变
// - 6 个 Prompt 任务各自的入口函数从对应任务文件再导出
// ============================================================================

export {
  callGeminiProxy,
  analyzeWithGemini,
  extractTextFromFile,
  runJsonTask,
  DEFAULT_MODELS,
} from "./client";

export { parseResumeText } from "./parse"; // #7 母版解析（纯文本→结构化）
export { rewriteSegment } from "./rewrite"; // #1 改写标注
export { evaluateRelevance } from "./relevance"; // #2 相关性评估
export { analyzeGap } from "./gap"; // #3 差距分析
export { classifyResumeType } from "./classify"; // #4 类型识别
export { generateGuidanceQuestions } from "./questions"; // #5 应届生提问
export { convertToStar } from "./star"; // #6 STAR 转换
export { parseJd } from "./parseJd"; // #8 JD 要求提取（只看 JD）
export { matchRequirements } from "./matchRequirements"; // #9 要求↔bullet 语义映射
