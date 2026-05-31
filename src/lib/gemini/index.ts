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

export { classifyResumeType } from "./classify"; // #4 类型识别
export { evaluateRelevance } from "./relevance"; // #2 相关性评估
export { rewriteSegment } from "./rewrite"; // #1 改写标注
