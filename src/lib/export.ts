// ============================================================================
// 导出（export）—— 把"完成页采纳后的最终投递内容"转成可复制 / 可下载的产物
// ----------------------------------------------------------------------------
// 【单一数据源铁律】导出消费的 ExportModel 由 CompletePage 从其已渲染的"采纳后
// bullet 列表"（走 scoring 的 isBulletAdopted，与评分同源）派生，本模块只做格式化，
// 不自起任何取数逻辑——导出内容必须与完成页屏幕上看到的最终投递内容逐字一致。
//
// 导出的是【干净简历文本】：纯 rewrittenText / userEditedText，不含 🟢🟡🔴 标注符号
// （那是工作态的来源标识，不进投递版）。
//
// 7B-1（本文件初版）：纯文本，零第三方依赖——逐段复制 / 复制全文。
// 7B-2 追加 .docx 下载（docx 库）。PDF 留 7B-3。
// ============================================================================

/** 一段的导出内容（标题 + 采纳后的 bullet 纯文本） */
export interface ExportSegment {
  title: string;
  typeLabel: string;
  bullets: string[];
}

/** 整份投递版的导出模型（CompletePage 从 includedSegments 派生，单一数据源） */
export interface ExportModel {
  /** 顶部上下文标签（公司 · 职位），与完成页屏幕一致 */
  jdLabel: string;
  segments: ExportSegment[];
}

/** 单段 → 纯文本（标题 + 每条 bullet 一行，无项目符号花样、无标注符号） */
export function segmentToPlainText(seg: ExportSegment): string {
  return [seg.title, ...seg.bullets.map((b) => `- ${b}`)].join("\n");
}

/** 整份 → 纯文本（顶部标签 + 各段，段间空行） */
export function modelToPlainText(model: ExportModel): string {
  return [model.jdLabel, "", ...model.segments.map(segmentToPlainText)]
    .join("\n\n")
    .trim();
}

/** 复制到剪贴板（localhost / https 下 navigator.clipboard 可用；失败抛错由调用方提示） */
export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // 兜底：老环境用临时 textarea + execCommand
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand("copy");
  document.body.removeChild(ta);
  if (!ok) throw new Error("复制失败");
}
