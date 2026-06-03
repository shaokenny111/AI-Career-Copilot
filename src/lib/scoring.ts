// ============================================================================
// 确定性加权匹配度评分（scoring）—— Phase 6B 核心
// ----------------------------------------------------------------------------
// 文档 2.6 铁律：整份简历匹配度是【确定性加权命中率】，绝不让 AI 打分（AI 打分会
// 漂移、不可解释，违背"可信透明"）。本模块是纯函数：输入 segmentDecisions +
// JD 要求清单（#8）+ 要求↔bullet 映射（#9），输出全局分数 + 每条要求的命中明细。
//
// 工作台（实时随采纳上涨）和完成页（回填 overallScore）必须共用本模块，保证两处
// 分数一致。
//
// ── 分工（产品原则）─────────────────────────────────────────────────────────
//   · 编译期：AI 做两件事——#8 从 JD（且只从 JD）提取要求全集；#9 跨语言语义判定
//     每条要求被哪些 bullet 覆盖。两者都已落盘在 CompiledVersion 上。
//   · 运行期（本模块）：纯确定性加权，不再跑 AI。要求命中与否，只取决于"覆盖它的
//     bullet 此刻是否被采纳"。
//
// ── 算法 ────────────────────────────────────────────────────────────────────
// 全局匹配度 = 命中要求的加权和 / 全部要求的加权和 × 100（线性映射，最透明）。
// 权重三档（文档 2.6）：Hard 2x / Title 1.5x / Context 1x。
//
// ── 诚实天花板 ──────────────────────────────────────────────────────────────
// 分母是 #8 从 JD 提取的【全部要求】，包含简历压根没覆盖的硬门槛（#9 映射为空）。
// 这些要求永远进分母、永远不命中，把分数诚实地压在天花板以下——这正是产品价值。
// （substantiveGaps 不再进分母：实质性差距对应的 JD 要求本就在要求全集里、且无
//  bullet 覆盖，已被自然计入；substantiveGaps 仅由 gap.ts 保留作面试策略展示。）
//
// ── 命中规则（诚实原则）────────────────────────────────────────────────────
//   · green / yellow bullet：默认采纳，计入；用户可逐条拒绝（gyDecision="reject"）→ 不计入。
//   · red bullet：仅当用户确认"我有"（redConfirmation.action = accept /
//     modify_and_accept）才计入；拒绝 / 未确认 → 不计入 → 分数不涨（正确行为）。
//   · 一条要求"命中" = 至少一条【已采纳】bullet 在 #9 映射里覆盖它。
//   · 隐藏段（finalIncluded=false）的 bullet 不参与（其 bullets 本就为空）。
//
// ── 改写前 vs 当前 ──────────────────────────────────────────────────────────
//   · scoreBefore：只数被 green bullet 覆盖的要求（green=基于原文事实，改写前即具
//     备其实质）。yellow（推断）/ red（补充）是改写 / 确认带来的增量。
//   · scoreNow：被任一【已采纳】bullet 覆盖的要求。adopted ⊇ green ⇒ now ≥ before。
// ============================================================================

import type {
  JdRequirement,
  RequirementImportance,
  RequirementMatch,
  RewrittenBullet,
  SegmentDecision,
} from "../types";

/** 三档权重（文档 2.6：Hard / Title / Context） */
export const TIER_WEIGHT: Record<RequirementImportance, number> = {
  hard: 2,
  title: 1.5,
  context: 1,
};

/** 一条参与评分的 JD 要求（带命中明细，用于右栏 / 完成页追溯） */
export interface ScoredRequirement {
  /** JdRequirement.id */
  id: string;
  /** 展示文本（JD 原文措辞） */
  label: string;
  /** 权重档 */
  importance: RequirementImportance;
  /** 权重数值 */
  weight: number;
  /** 当前是否命中（被已采纳 bullet 覆盖） */
  hitNow: boolean;
  /** 改写前是否命中（仅被 green bullet 覆盖） */
  hitBefore: boolean;
  /** #9 映射到的 bullet id（空=简历完全没覆盖这条要求，构成天花板缺口） */
  bulletIds: string[];
}

/** 全局评分结果 */
export interface MatchScore {
  /** 当前分数 0-100 */
  scoreNow: number;
  /** 改写前分数 0-100 */
  scoreBefore: number;
  /** 增量（≥0） */
  delta: number;
  hitWeightNow: number;
  hitWeightBefore: number;
  totalWeight: number;
  /** 所有参与评分的要求（含命中明细） */
  requirements: ScoredRequirement[];
}

// ---------- bullet 小工具 ----------

/** 该 bullet 是否计入评分 / 写入最终版（green/yellow 默认采纳；red 需确认采纳）。
 *  导出：完成页"采纳后的 bullet 列表"必须用这同一条判定，避免与评分口径漂移。 */
export function isBulletAdopted(b: RewrittenBullet): boolean {
  if (b.sourceLevel === "red") {
    const a = b.redConfirmation?.action;
    return a === "accept" || a === "modify_and_accept";
  }
  // 绿/黄默认采纳（未处理也计入，保持既有分数口径）；仅当用户【显式拒绝】才排除。
  return b.gyDecision !== "reject";
}

/** bullet 运行期状态：是否已采纳 + 是否 green（改写前事实） */
interface BulletState {
  adopted: boolean;
  green: boolean;
}

/** 收集所有【已纳入段落】的 bullet 状态：id → BulletState（隐藏段 bullets 为空） */
function collectBulletStates(
  segmentDecisions: SegmentDecision[],
): Map<string, BulletState> {
  const map = new Map<string, BulletState>();
  for (const d of segmentDecisions) {
    if (!d.finalIncluded) continue;
    for (const b of d.bullets) {
      map.set(b.id, { adopted: isBulletAdopted(b), green: b.sourceLevel === "green" });
    }
  }
  return map;
}

// ---------- 核心：全局评分 ----------

/**
 * 计算整份简历的全局匹配度（纯函数，确定性，工作台与完成页共用）。
 *
 * @param segmentDecisions 子版对每段的处理决策（含 bullets + 红色确认状态）
 * @param requirements     #8 从 JD 提取的要求全集（分母=诚实天花板）
 * @param matches          #9 编译期建立的"要求↔bullet"映射
 */
export function computeMatchScore(
  segmentDecisions: SegmentDecision[],
  requirements: JdRequirement[],
  matches: RequirementMatch[],
): MatchScore {
  const bulletStates = collectBulletStates(segmentDecisions);
  const matchByReq = new Map(matches.map((m) => [m.requirementId, m.bulletIds]));

  const scored: ScoredRequirement[] = requirements.map((r) => {
    const bulletIds = matchByReq.get(r.id) ?? [];
    let hitNow = false;
    let hitBefore = false;
    for (const bid of bulletIds) {
      const st = bulletStates.get(bid);
      if (!st) continue; // 映射指向隐藏段 / 不存在的 bullet → 不计入
      if (st.adopted) hitNow = true;
      if (st.green) hitBefore = true;
    }
    return {
      id: r.id,
      label: r.text,
      importance: r.importance,
      weight: TIER_WEIGHT[r.importance],
      hitNow,
      hitBefore,
      bulletIds,
    };
  });

  let totalWeight = 0;
  let hitWeightNow = 0;
  let hitWeightBefore = 0;
  for (const r of scored) {
    totalWeight += r.weight;
    if (r.hitNow) hitWeightNow += r.weight;
    if (r.hitBefore) hitWeightBefore += r.weight;
  }

  const scoreNow =
    totalWeight > 0 ? Math.round((hitWeightNow / totalWeight) * 100) : 0;
  const scoreBefore =
    totalWeight > 0 ? Math.round((hitWeightBefore / totalWeight) * 100) : 0;

  return {
    scoreNow,
    scoreBefore,
    delta: Math.max(0, scoreNow - scoreBefore),
    hitWeightNow,
    hitWeightBefore,
    totalWeight,
    requirements: scored,
  };
}

// ---------- 每段 JD 命中追溯（右栏块 2）----------

/** 单段里一条 JD 要求的命中行 */
export interface SegmentRequirementRow {
  /** 要求文本 */
  phrase: string;
  /** 是否已命中（本段有已采纳 bullet 覆盖它） */
  hit: boolean;
  /** 命中它的 bullet 在本段的序号（1-based，用于"由 bullet N 命中"） */
  byBulletIndex?: number;
  /** 仅被本段未确认的 red bullet 覆盖 → 待确认 */
  pending: boolean;
}

/**
 * 计算单段的 JD 要求命中明细（右栏"本段 JD 要求命中"联动用）。
 * 只列【本段 bullet 覆盖到】的要求；与 computeMatchScore 同一套命中判定，保证联动一致。
 *
 * @param decision     本段处理决策
 * @param requirements #8 要求全集
 * @param matches      #9 映射
 */
export function computeSegmentRequirements(
  decision: SegmentDecision,
  requirements: JdRequirement[],
  matches: RequirementMatch[],
): SegmentRequirementRow[] {
  if (!decision.finalIncluded) return [];

  // 本段 bullet id → 在本段的序号（1-based）+ 状态
  const localIndex = new Map<string, number>();
  const localState = new Map<string, BulletState>();
  decision.bullets.forEach((b, i) => {
    localIndex.set(b.id, i + 1);
    localState.set(b.id, {
      adopted: isBulletAdopted(b),
      green: b.sourceLevel === "green",
    });
  });
  // 本段里"未确认的 red bullet"（用于待确认判定）
  const pendingRedIds = new Set(
    decision.bullets
      .filter((b) => b.sourceLevel === "red" && !b.redConfirmation)
      .map((b) => b.id),
  );

  const matchByReq = new Map(matches.map((m) => [m.requirementId, m.bulletIds]));
  const rows: SegmentRequirementRow[] = [];

  for (const r of requirements) {
    const bulletIds = matchByReq.get(r.id) ?? [];
    // 只保留落在本段的覆盖 bullet
    const localCover = bulletIds.filter((bid) => localIndex.has(bid));
    if (localCover.length === 0) continue; // 本段不涉及这条要求

    let hit = false;
    let byBulletIndex: number | undefined;
    let pending = false;
    for (const bid of localCover) {
      if (localState.get(bid)?.adopted && !hit) {
        hit = true;
        byBulletIndex = localIndex.get(bid);
      }
      if (pendingRedIds.has(bid)) pending = true;
    }

    rows.push({
      phrase: r.text,
      hit,
      ...(byBulletIndex !== undefined ? { byBulletIndex } : {}),
      // 已命中的不再标"待确认"
      pending: hit ? false : pending,
    });
  }

  return rows;
}
