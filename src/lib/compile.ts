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
  GapAnalysis,
  JdRequirement,
  JobDescription,
  Master,
  OverallJudgment,
  RewrittenBullet,
  Segment,
  SegmentDecision,
} from "../types";
import {
  evaluateRelevance,
  generateGapStrategies,
  matchRequirements,
  parseJd,
  rewriteSegment,
} from "./gemini";
import { computeMatchScore, IMPORTANCE_TO_SEVERITY } from "./scoring";

/**
 * 编译阶段标识——供 UI 渲染分阶段加载文案（编译要打 5+ 次 Gemini、十几秒起步，
 * 期间不能白屏；用阶段回调把"管线跑到哪了"实时反馈给加载页）。
 *   analyzing    第一相：相关性评估 / 经历改写 / JD 要求提取（并发，最耗时）
 *   matching     第二相：要求↔bullet 语义映射
 *   strategizing 第三相：为未满足要求生成面试策略
 */
export type CompileStage = "analyzing" | "matching" | "strategizing";

/** 生成稳定随机 id（与 resumeIntake 同风格，无第三方依赖） */
function genId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

/** 事实清单类段落：教育/技能/证书。这类是"课程/证书/语言成绩/分数"的事实清单，
 *  绝不该走 #1 那套"为 JD 改写成能力句"的逻辑 —— 改走零 AI 确定性直通。 */
const FACT_LIST_TYPES: ReadonlySet<Segment["type"]> = new Set([
  "education",
  "skill",
  "certificate",
]);

/**
 * 零 AI 确定性直通：把事实清单段的原文按行拆成 green bullet，
 * 课程名/证书/语言成绩/分数【原样保留】，绝不改写成"具备…能力"的能力描述句。
 * 契约不变：仍输出带稳定 id 的 RewrittenBullet（全 green），#9 映射 / scoring /
 * 差距逻辑都不用改（#9 仍按 id+文本把 JD 要求映射到这些事实 bullet）。
 */
function passthroughBullets(seg: Segment): RewrittenBullet[] {
  return seg.content
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((text) => ({
      id: genId("blt"),
      rewrittenText: text,
      originalText: text,
      sourceLevel: "green" as const,
      whatChanged: "原样保留",
      whyChanged: "教育/技能/证书为事实清单，仅展示不改写成能力句",
      matchedJdPhrases: [],
    }));
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
  onProgress?: (stage: CompileStage) => void,
): Promise<CompiledVersion> {
  const segments = master.segments;

  // ── 第一相：相关性 / 改写 / JD 要求提取（互不依赖，并发）──
  onProgress?.("analyzing");
  // 注意：#3 已退化为"只给未满足要求写应对话术"，依赖 #9 的满足判定，故移到第三相。
  const [relevanceOut, rewrites, parsedJd] = await Promise.all([
    evaluateRelevance({ segments, jobDescription: jd }),
    Promise.all(
      segments.map(async (seg) => ({
        segmentId: seg.id,
        // 工作/实习/项目（及其它经历类）→ #1 改写；教育/技能/证书 → 零 AI 事实直通
        bullets: FACT_LIST_TYPES.has(seg.type)
          ? passthroughBullets(seg)
          : (await rewriteSegment({ segment: seg, jobDescription: jd })).bullets,
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
  onProgress?.("matching");
  const allBullets = segmentDecisions.flatMap((d) =>
    d.bullets.map((b) => ({ id: b.id, text: b.rewrittenText })),
  );
  const { matches: requirementMatches } = await matchRequirements({
    requirements,
    bullets: allBullets,
  });

  // ── 第三相：确定性派生差距 + #3 仅为未满足要求生成应对话术 ──
  // 单一事实源：computeMatchScore 用默认采纳（绿/黄计入、红未确认不计入）算出每条要求
  // 满足与否。未满足 = 差距，severity 取该要求 importance。差距与命中互斥，绝无"命中
  // 又差距"。#3 只对未满足要求补面试话术。
  const score = computeMatchScore(segmentDecisions, requirements, requirementMatches);
  const unsatisfied = score.requirements.filter((r) => !r.hitNow);

  const strategyByReq = new Map<string, { interviewStrategy: string; capabilityAdvice: string }>();
  if (unsatisfied.length > 0) {
    onProgress?.("strategizing");
    const { strategies } = await generateGapStrategies({
      unsatisfiedRequirements: unsatisfied.map((r) => ({
        id: r.id,
        text: r.label,
        importance: r.importance,
      })),
      jobDescription: jd,
      segments,
    });
    for (const s of strategies)
      strategyByReq.set(s.requirementId, {
        interviewStrategy: s.interviewStrategy,
        capabilityAdvice: s.capabilityAdvice,
      });
  }

  const hasHardGap = unsatisfied.some((r) => r.importance === "hard");
  const gapAnalysis: GapAnalysis = {
    expressionGaps: [], // 已废弃：统一后不区分表达性/实质性差距
    substantiveGaps: unsatisfied.map((r) => ({
      requirementId: r.id,
      jdRequirement: r.label,
      severity: IMPORTANCE_TO_SEVERITY[r.importance],
      interviewStrategy: strategyByReq.get(r.id)?.interviewStrategy ?? "",
      capabilityAdvice: strategyByReq.get(r.id)?.capabilityAdvice ?? "",
    })),
    overallJudgment: judgmentFromScore(score.scoreNow, hasHardGap),
    overallScore: score.scoreNow, // 确定性回填（默认采纳口径），子版库/完成页即取此数
  };

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
    gapAnalysis,
    applicationMark: { applied: false },
    language: master.language,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

/** 整体投递建议：确定性从分数 + 是否有 hard 差距得出（不经 AI）。
 *  有 hard 门槛未满足时压低判断；否则按分数分档。 */
function judgmentFromScore(scoreNow: number, hasHardGap: boolean): OverallJudgment {
  if (hasHardGap) return scoreNow >= 75 ? "improve_first" : "not_recommended";
  if (scoreNow >= 70) return "recommended";
  if (scoreNow >= 50) return "improve_first";
  return "not_recommended";
}
