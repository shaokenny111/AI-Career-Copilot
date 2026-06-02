// ============================================================================
// 编译管线（compile）—— master + JD → CompiledVersion 草稿
// ----------------------------------------------------------------------------
// 两相管线。
//
// 【第一相】对母版每段经历 + 目标 JD，并发跑四个互不依赖的 Prompt：
//   #2 relevance （每段相关性 + 取舍建议）
//   #1 rewrite   （每段改写成三色标注 bullets，逐段调用；bullet 自带稳定 id）
//   #3 gap       （表达性 / 实质性差距 + 整体建议）
//   #8 parseJd   （只看 JD 提取要求清单 + 权重档——分母全集=诚实天花板）
//
// 【第二相】用第一相产物（带 id 的要求 + 已纳入段落的全部 bullet）跑：
//   #9 matchRequirements（编译期建立"要求↔bullet"语义映射，跨语言）
// 映射只在编译期算一次；运行期 scoring 只读它做确定性加权，绝不再跑 AI。
//
// 铁律遵守：所有 Prompt 的简历输入都经 format.ts 序列化，强制带 timeRange +
// isCurrent；#8 只接收 JD，绝不掺简历（否则会漏报未覆盖要求、破坏诚实天花板）。
//
// overallScore 仍置 0 占位（gap.ts 已置 0）——匹配度是确定性加权命中率，
// 由 Phase 6 工作台随用户采纳实时计算，绝不在本步让 AI 打分。
// ============================================================================

import type {
  CompiledVersion,
  JdRequirement,
  JobDescription,
  Master,
  RewrittenBullet,
  SegmentDecision,
} from "../types";
import {
  analyzeGap,
  evaluateRelevance,
  matchRequirements,
  parseJd,
  rewriteSegment,
} from "./gemini";

/** 生成稳定随机 id（与 resumeIntake 同风格，无第三方依赖） */
function genId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

/** 子版默认名："公司-职位-YYYYMMDD" */
function defaultVersionName(jd: JobDescription, when: Date): string {
  const y = when.getFullYear();
  const m = String(when.getMonth() + 1).padStart(2, "0");
  const d = String(when.getDate()).padStart(2, "0");
  return `${jd.company}-${jd.position}-${y}${m}${d}`;
}

/**
 * 跑一次完整编译，返回组装好的 CompiledVersion 草稿（不落盘，由调用方决定存储）。
 *
 * 并发策略：
 *   第一相 — #2 / #3 / #8 各一次调用，#1 按段并发；四组一起 Promise.all。
 *   第二相 — #9 用第一相产物建立要求↔bullet 映射。
 * 任一调用失败（含 zod 校验失败、配额耗尽）会让 Promise 拒绝，由调用方捕获并提示
 * 重试——草稿要么完整生成，要么不生成，不出半成品。
 */
export async function runCompile(
  master: Master,
  jd: JobDescription,
): Promise<CompiledVersion> {
  const segments = master.segments;

  // ── 第一相：相关性 / 差距 / 改写 / JD 要求提取（互不依赖，并发）──
  const [relevanceOut, gapAnalysis, rewrites, parsedJd] = await Promise.all([
    evaluateRelevance({ segments, jobDescription: jd }),
    analyzeGap({ segments, jobDescription: jd }),
    Promise.all(
      segments.map(async (seg) => ({
        segmentId: seg.id,
        bullets: (await rewriteSegment({ segment: seg, jobDescription: jd }))
          .bullets,
      })),
    ),
    parseJd({ jobDescription: jd }), // 铁律：只传 JD，不传 segments
  ]);

  // JD 要求赋稳定 id → JdRequirement[]（#9 映射与运行期评分都靠它引用）
  const requirements: JdRequirement[] = parsedJd.requirements.map((r) => ({
    id: genId("req"),
    text: r.text,
    importance: r.importance,
  }));

  const evalById = new Map(
    relevanceOut.evaluations.map((e) => [e.segmentId, e]),
  );
  const bulletsById = new Map<string, RewrittenBullet[]>(
    rewrites.map((r) => [r.segmentId, r.bullets]),
  );

  const segmentDecisions: SegmentDecision[] = segments.map((seg) => {
    const ev = evalById.get(seg.id);
    // AI 偶尔漏评某段时，保守默认：弱相关 + 精简保留，仍纳入，避免静默丢经历
    const relevance = ev?.relevance ?? "medium";
    const suggestedAction = ev?.suggestedAction ?? "keep_simplified";

    // 前端规则 override：hide 之外都纳入；但"当前在职"的段即使被判 low 也不隐藏
    let finalIncluded = suggestedAction !== "hide_in_this_version";
    if (!finalIncluded && seg.isCurrent) finalIncluded = true;

    // 契约：bullets 仅在 finalIncluded=true 时有内容
    const bullets = finalIncluded ? bulletsById.get(seg.id) ?? [] : [];

    return {
      segmentId: seg.id,
      relevance,
      suggestedAction,
      finalIncluded,
      bullets,
      relevanceReason: ev?.reason ?? "",
      ...(ev?.transferableValue
        ? { transferableValue: ev.transferableValue }
        : {}),
    };
  });

  // ── 第二相：要求↔bullet 语义映射（#9）──
  // 只取已纳入段落的 bullet（隐藏段 bullets 为空）；用 rewrittenText 作为匹配文本
  // （编译期尚无用户编辑）。
  const allBullets = segmentDecisions.flatMap((d) =>
    d.bullets.map((b) => ({ id: b.id, text: b.rewrittenText })),
  );
  const { matches: requirementMatches } = await matchRequirements({
    requirements,
    bullets: allBullets,
  });

  const now = new Date();
  const nowIso = now.toISOString();

  return {
    id: genId("ver"),
    masterId: master.id,
    name: defaultVersionName(jd, now),
    // JD 带上结构化要求（确定性匹配度的分母全集=诚实天花板）
    jobDescription: { ...jd, requirements },
    segmentDecisions,
    requirementMatches,
    gapAnalysis, // overallScore 已是 0 占位（Phase 6 回填）
    applicationMark: { applied: false },
    language: master.language,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}
