// ============================================================================
// 输入序列化（format）—— 把 types.ts 的结构化数据拼成 Prompt 的"真实输入"部分
// ----------------------------------------------------------------------------
// 文档 2.4 / 2.5 铁律：
//   - 传给 AI 的永远是结构化、完整、真实的简历数据，禁止传摘要
//   - 涉及 AI 输入的 Segment 必须带 timeRange 和 isCurrent（缺失 AI 会脑补工作
//     年限、误判应届生）。本文件是唯一的输入拼装出口，确保两字段永远被带上。
// ============================================================================

import type { JobDescription, Segment } from "../../types";

/** timeRange + isCurrent → 一行人类可读时间描述（强制带，缺一不可） */
function formatTimeRange(segment: Segment): string {
  const { start, end } = segment.timeRange;
  const status = segment.isCurrent ? "在职/进行中" : "已结束";
  return `${start} ~ ${end}（${status}）`;
}

/** 序列化单段经历，强制包含 timeRange 与 isCurrent */
export function formatSegment(segment: Segment): string {
  const lines = [
    `- segment_id: ${segment.id}`,
    `  类型: ${segment.type}`,
    `  标题: ${segment.title}`,
  ];
  if (segment.subtitle) lines.push(`  副标题: ${segment.subtitle}`);
  lines.push(`  时间: ${formatTimeRange(segment)}`);
  lines.push(`  正文: ${segment.content}`);
  if (segment.tags.length > 0) lines.push(`  标签: ${segment.tags.join("、")}`);
  return lines.join("\n");
}

/** 序列化多段经历 */
export function formatSegments(segments: Segment[]): string {
  return segments.map(formatSegment).join("\n\n");
}

/** 序列化 JD（按 types.ts 的 JobDescription 契约：公司/职位/原文/核心要求/关键词） */
export function formatJobDescription(jd: JobDescription): string {
  const lines = [
    `公司: ${jd.company}`,
    `职位: ${jd.position}`,
    `JD 原文: ${jd.rawText}`,
  ];
  if (jd.coreRequirements?.length) {
    lines.push(`核心要求: ${jd.coreRequirements.join("；")}`);
  }
  if (jd.keywords?.length) {
    lines.push(`关键词: ${jd.keywords.join("、")}`);
  }
  return lines.join("\n");
}
