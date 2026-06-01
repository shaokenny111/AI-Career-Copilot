// ============================================================================
// 简历摄入（resumeIntake）—— 上传流程的纯逻辑层
// ----------------------------------------------------------------------------
// 把"解析出的纯文本 + ParsedSegment[]"加工成：
//   1. classify.ts(#4) 需要的统计摘要 ResumeTypeInput（A/B/C 真实识别的输入）
//   2. 可落盘的 Master（补全 id / 时间戳 / resumeType）
// 不含任何 UI、不直接读写 storage，便于单测与复用。
// ============================================================================

import type {
  BasicInfo,
  Master,
  ParsedSegment,
  ResumeType,
  ResumeTypeInput,
  Segment,
} from "../types";

/** 估算一段经历的 bullet 数：按换行 / 中英文句号分号切，过滤过短碎片，至少 1 */
function estimateBulletCount(content: string): number {
  const pieces = content
    .split(/\r?\n|[。；;]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 4);
  return Math.max(1, pieces.length);
}

/** segment 是否带有效时间（用于 classify 的 has_time_range 信号） */
function hasTimeRange(seg: ParsedSegment): boolean {
  return !!(seg.timeRange.start || seg.timeRange.end);
}

/**
 * 由解析结果拼出 #4 类型识别的输入摘要。
 * 注意：只传统计特征，不传完整简历（文档 7 章约定）。
 */
export function buildClassifyInput(
  rawText: string,
  parsed: { basicInfo: BasicInfo; segments: ParsedSegment[] },
): ResumeTypeInput {
  const { basicInfo, segments } = parsed;
  return {
    // 中文简历按字符数近似字数
    wordCount: rawText.replace(/\s/g, "").length,
    segmentCount: segments.length,
    segmentsSummary: segments.map((s) => ({
      type: s.type,
      bulletCount: estimateBulletCount(s.content),
      hasTimeRange: hasTimeRange(s),
    })),
    hasBasicInfo: !!(basicInfo.name && (basicInfo.email || basicInfo.phone)),
    textSample: rawText.slice(0, 500),
  };
}

/** 生成一个稳定的随机 id（无第三方依赖，够用即可） */
function genId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

/**
 * 把解析结果 + 类型判定固化成可落盘的 Master。
 * 每个 ParsedSegment 在此补全 id / createdAt / updatedAt，时间字段原样保留
 * （timeRange + isCurrent 由解析层强制带上，这里不再脑补）。
 */
export function buildMaster(
  parsed: { basicInfo: BasicInfo; segments: ParsedSegment[] },
  resumeType: ResumeType,
): Master {
  const now = new Date().toISOString();
  const segments: Segment[] = parsed.segments.map((s) => ({
    id: genId(`seg_${s.type}`),
    type: s.type,
    title: s.title,
    ...(s.subtitle ? { subtitle: s.subtitle } : {}),
    content: s.content,
    timeRange: s.timeRange,
    isCurrent: s.isCurrent,
    tags: s.tags,
    createdAt: now,
    updatedAt: now,
  }));

  return {
    id: genId("master"),
    basicInfo: parsed.basicInfo,
    segments,
    language: "zh",
    resumeType,
    createdAt: now,
    updatedAt: now,
  };
}
