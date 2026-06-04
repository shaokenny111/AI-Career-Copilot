// ============================================================================
// 应届生引导摄入（guidanceIntake）—— C 类问答流程的纯逻辑层
// ----------------------------------------------------------------------------
// 职责：把"问答攒下的 STAR bullet"经【用户归集】成若干经历段后，组装成合法 Master。
//   - 不含任何 UI、不调 AI、不直接读写 storage（便于单测与复用，对齐 resumeIntake.ts）
//   - 核心铁律：每段的 timeRange + isCurrent 由【用户填】保证非空——绝不让 AI 脑补年限。
//     本层只做"结构校验 + 组装"，时间/公司是输入，不是推断结果。
//   - 写入路径复用 A/B 主线：drafts → ParsedSegment[] → buildMaster → （调用方）persistMaster。
//     组装出的 Master.resumeType 保持 "C_incomplete"，但结构与 A/B 完全一致，可直接走主线。
// ============================================================================

import type {
  BasicInfo,
  Master,
  ParsedSegment,
  SegmentType,
  SourceLevel,
  TimeRange,
} from "../types";
import { buildMaster } from "./resumeIntake";

/** 问答攒下的一条 bullet（来自 #6 STAR 转换，或第一步的结构验证桩数据）。
 *  Phase 4 的 bullet 只可能是 green/yellow（整理用户真实回答）——绝不产 JD 反写的 red。 */
export interface GuidanceBullet {
  /** 本地唯一 id（仅用于归集时的 UI 选择 / 关联，不落盘） */
  id: string;
  /** 对应的 JD 能力点（来自 #5 问题的 topic，用 JD 原词） */
  topic: string;
  /** STAR 化后的 bullet 文本（#6 的 starBullet） */
  text: string;
  /** 信息来源等级（Phase 4 仅 green/yellow） */
  sourceLevel: SourceLevel;
  /** 用户没说清的 STAR 元素（前端提示"建议补充"，不影响落盘） */
  missingElements: string[];
}

/** 用户归集出的一段经历草稿（归集层产出）。
 *  title / timeRange / isCurrent 全部由用户填写——这是补齐铁律字段的唯一来源。 */
export interface SegmentDraft {
  /** 本地唯一 id（UI keying 用，不落盘；落盘 id 由 buildMaster 生成） */
  id: string;
  /** 经历类型（用户选：实习/项目/活动/教育…） */
  type: SegmentType;
  /** 标题：公司 / 项目 / 学校 / 组织（用户填，缺失=非法） */
  title: string;
  /** 副标题（可选，如角色/城市） */
  subtitle?: string;
  /** 时间范围（用户填起止，缺失起始=非法；防 AI 脑补年限） */
  timeRange: TimeRange;
  /** 是否当前在职/进行中（用户勾） */
  isCurrent: boolean;
  /** 归到本段的 bullet id 列表（至少 1 条才合法） */
  bulletIds: string[];
}

/** 一条草稿的校验结果（UI 据此给"生成母版"按钮门控 + 行内提示） */
export interface DraftValidationError {
  draftId: string;
  /** 缺哪些必填项（中文，可直接展示） */
  missing: string[];
}

/** 生成一个本地 id（仅 UI/关联用，落盘 id 另由 buildMaster 赋值）。 */
export function genLocalId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

/**
 * 校验所有草稿是否满足铁律 + 组装前置条件。返回每段的缺失项（空数组=全部合法）。
 * 铁律：title 非空、timeRange.start 非空、isCurrent=false 时 end 非空、至少 1 条 bullet。
 */
export function validateDrafts(drafts: SegmentDraft[]): DraftValidationError[] {
  const errors: DraftValidationError[] = [];
  for (const d of drafts) {
    const missing: string[] = [];
    if (!d.title.trim()) missing.push("标题");
    if (!d.timeRange.start.trim()) missing.push("起始时间");
    if (!d.isCurrent && !d.timeRange.end.trim()) missing.push("结束时间");
    if (d.bulletIds.length === 0) missing.push("至少 1 条经历内容");
    if (missing.length) errors.push({ draftId: d.id, missing });
  }
  return errors;
}

/**
 * 把一段草稿 + 其 bullet 组装成 ParsedSegment（对齐 types.ts:411-423）。
 * - content：把归到本段的 bullet 文本按顺序拼成完整正文（真实内容，非摘要）
 * - timeRange / isCurrent：原样取用户所填（绝不在此推断）
 * - end：isCurrent=true 时归一为 "present"（对齐 Segment 约定）
 * - tags：本段 bullet 命中的 JD 能力点去重（给后续 AI 判相关性用）
 */
function draftToParsedSegment(
  draft: SegmentDraft,
  bulletsById: Map<string, GuidanceBullet>,
): ParsedSegment {
  const bullets = draft.bulletIds
    .map((id) => bulletsById.get(id))
    .filter((b): b is GuidanceBullet => !!b);

  const content = bullets.map((b) => b.text).join("\n");
  const tags = Array.from(new Set(bullets.map((b) => b.topic).filter(Boolean)));

  return {
    type: draft.type,
    title: draft.title.trim(),
    ...(draft.subtitle?.trim() ? { subtitle: draft.subtitle.trim() } : {}),
    content,
    timeRange: {
      start: draft.timeRange.start.trim(),
      end: draft.isCurrent ? "present" : draft.timeRange.end.trim(),
    },
    isCurrent: draft.isCurrent,
    tags,
  };
}

/** 把所有合法草稿组装成 ParsedSegment[]（顺序即草稿顺序）。 */
export function assembleParsedSegments(
  drafts: SegmentDraft[],
  bullets: GuidanceBullet[],
): ParsedSegment[] {
  const byId = new Map(bullets.map((b) => [b.id, b]));
  return drafts.map((d) => draftToParsedSegment(d, byId));
}

/**
 * 组装的总入口：归集结果 → 合法 Master（复用 A/B 主线的 buildMaster）。
 * 调用方负责先 validateDrafts 通过、再 persistMaster 落盘。
 * resumeType 固定 "C_incomplete"——结构已与 A/B 一致，类型仅作来源标记。
 */
export function assembleGuidanceMaster(input: {
  basicInfo: BasicInfo;
  drafts: SegmentDraft[];
  bullets: GuidanceBullet[];
}): Master {
  const segments = assembleParsedSegments(input.drafts, input.bullets);
  return buildMaster(
    { basicInfo: input.basicInfo, segments },
    "C_incomplete",
  );
}
