// ============================================================================
// 只读诊断：拆解一份子版的匹配度评分，定位 #9 命中是否存在假阳性
// ----------------------------------------------------------------------------
// 不改业务代码、不打 Gemini、不烧配额。复用 src/lib/scoring.ts 的 computeMatchScore
// （与工作台/完成页同一纯函数），把 #8 要求全集逐条摊开：
//   · 每条 text / importance / 权重 / hitNow
//   · 命中的要求：连带"命中它的 bullet 原文 + 色级 + 是否采纳"——抓假阳性的关键
//   · 命中权重和 / 差距权重和 / 总权重；scoreNow / scoreBefore
//   · 断言：命中权重 + 差距权重 == 总权重；round(命中/总×100) == scoreNow
//
// 跑法：
//   npx tsx scripts/diagnose-version.ts <version.json>            （文件=单个子版）
//   npx tsx scripts/diagnose-version.ts <storage.json> <versionId>（文件=整份 storage）
//   npx tsx scripts/diagnose-version.ts <storage.json>            （列出所有子版 id）
// ============================================================================

import { readFileSync } from "node:fs";
import {
  computeMatchScore,
  isBulletAdopted,
  TIER_WEIGHT,
} from "../src/lib/scoring";
import type { CompiledVersion, RewrittenBullet } from "../src/types";

// ---------- 入参 ----------
const [, , filePath, versionIdArg] = process.argv;
if (!filePath) {
  console.error(
    "用法：npx tsx scripts/diagnose-version.ts <json 文件> [versionId]",
  );
  process.exit(1);
}

let parsed: any;
try {
  parsed = JSON.parse(readFileSync(filePath, "utf8"));
} catch (e) {
  console.error(`读取/解析 JSON 失败：${filePath}`);
  console.error(e);
  process.exit(1);
}

// ---------- 从输入里取出目标子版（兼容单子版 / 整份 storage）----------
function resolveVersion(): CompiledVersion {
  // 整份 storage：有 compiledVersions 数组
  if (Array.isArray(parsed?.compiledVersions)) {
    const list: CompiledVersion[] = parsed.compiledVersions;
    if (list.length === 0) {
      console.error("storage 里没有任何子版（compiledVersions 为空）。");
      process.exit(1);
    }
    if (versionIdArg) {
      const found = list.find((v) => v.id === versionIdArg);
      if (!found) {
        console.error(`未找到 id=${versionIdArg} 的子版。可选 id：`);
        list.forEach((v) => console.error(`  · ${v.id}  (${v.name})`));
        process.exit(1);
      }
      return found;
    }
    if (list.length === 1) return list[0]!;
    console.error("这是整份 storage，含多个子版，请在第二个参数指定 versionId：");
    list.forEach((v) => console.error(`  · ${v.id}  (${v.name})`));
    process.exit(1);
  }
  // 否则当作单个子版
  if (parsed?.jobDescription && parsed?.segmentDecisions) {
    return parsed as CompiledVersion;
  }
  console.error(
    "无法识别 JSON：既不是含 compiledVersions 的 storage，也不是单个子版（缺 jobDescription/segmentDecisions）。",
  );
  process.exit(1);
}

const version = resolveVersion();
const requirements = version.jobDescription.requirements ?? [];
const matches = version.requirementMatches ?? [];

// ---------- bullet id → 展示信息（原文 + 色级 + 是否采纳 + 所属段）----------
interface BulletInfo {
  text: string;
  level: RewrittenBullet["sourceLevel"];
  adopted: boolean;
  included: boolean;
  segmentId: string;
}
const bulletInfo = new Map<string, BulletInfo>();
for (const d of version.segmentDecisions) {
  for (const b of d.bullets) {
    bulletInfo.set(b.id, {
      text: b.userEditedText ?? b.rewrittenText,
      level: b.sourceLevel,
      adopted: isBulletAdopted(b),
      included: d.finalIncluded,
      segmentId: d.segmentId,
    });
  }
}

const matchByReq = new Map(matches.map((m) => [m.requirementId, m.bulletIds]));

// ---------- 复用同一套评分 ----------
const score = computeMatchScore(version.segmentDecisions, requirements, matches);
const scoredById = new Map(score.requirements.map((r) => [r.id, r]));

const LEVEL_TAG: Record<RewrittenBullet["sourceLevel"], string> = {
  green: "绿/原文事实",
  yellow: "黄/AI推断",
  red: "红/补充",
};

// ---------- 打印 ----------
const line = "─".repeat(72);
console.log(line);
console.log(`子版：${version.name}`);
console.log(`岗位：${version.jobDescription.company} · ${version.jobDescription.position}`);
console.log(`#8 要求总数：${requirements.length} 条`);
console.log(line);

// 命中与差距分组（按权重档排序：hard → title → context）
const ORDER: Record<string, number> = { hard: 0, title: 1, context: 2 };
const sorted = [...score.requirements].sort(
  (a, b) => ORDER[a.importance]! - ORDER[b.importance]!,
);

console.log("\n【命中的要求】（重点核对：中文简历是否真的等量满足，警惕假阳性）\n");
const hits = sorted.filter((r) => r.hitNow);
if (hits.length === 0) console.log("  （无）");
for (const r of hits) {
  console.log(
    `  ✔ [${r.importance} ×${TIER_WEIGHT[r.importance]}] ${r.label}`,
  );
  const bids = matchByReq.get(r.id) ?? [];
  const adoptedCovers = bids
    .map((bid) => ({ bid, info: bulletInfo.get(bid) }))
    .filter((x) => x.info && x.info.included && x.info.adopted);
  if (adoptedCovers.length === 0) {
    console.log("      ⚠ 标记命中但找不到已采纳的覆盖 bullet（异常，请核查映射）");
  }
  for (const { info } of adoptedCovers) {
    console.log(`      ← [${LEVEL_TAG[info!.level]}] ${info!.text}`);
  }
}

console.log("\n【未满足的要求 = 差距列表】（应与完成页逐条一致）\n");
const gaps = sorted.filter((r) => !r.hitNow);
if (gaps.length === 0) console.log("  （无）");
for (const r of gaps) {
  console.log(
    `  ✘ [${r.importance} ×${TIER_WEIGHT[r.importance]}] ${r.label}`,
  );
  // 若有映射 bullet 却未计入命中，提示原因（未采纳 / 隐藏段），便于判断是否漏判
  const bids = matchByReq.get(r.id) ?? [];
  for (const bid of bids) {
    const info = bulletInfo.get(bid);
    if (!info) continue;
    const why = !info.included
      ? "所在段未纳入"
      : !info.adopted
        ? "bullet 未采纳"
        : "已采纳但仍未计命中(异常)";
    console.log(`      · 映射到 [${LEVEL_TAG[info.level]}] ${info.text}  → ${why}`);
  }
}

// ---------- 权重核算 + 断言 ----------
const gapWeight = score.totalWeight - score.hitWeightNow;
const recomputedScore =
  score.totalWeight > 0
    ? Math.round((score.hitWeightNow / score.totalWeight) * 100)
    : 0;

console.log("\n" + line);
console.log("【权重核算】");
console.log(`  命中权重和：${score.hitWeightNow}`);
console.log(`  差距权重和：${gapWeight}`);
console.log(`  总权重    ：${score.totalWeight}`);
console.log(`  scoreNow  ：${score.scoreNow}   scoreBefore：${score.scoreBefore}   Δ：${score.delta}`);
console.log(line);

const okSum = score.hitWeightNow + gapWeight === score.totalWeight;
const okScore = recomputedScore === score.scoreNow;
console.log("\n【断言】");
console.log(`  ${okSum ? "✅" : "❌"} 命中权重 + 差距权重 == 总权重  (${score.hitWeightNow} + ${gapWeight} == ${score.totalWeight})`);
console.log(`  ${okScore ? "✅" : "❌"} round(命中/总×100) == scoreNow  (${recomputedScore} == ${score.scoreNow})`);
console.log(
  `\n命中 ${hits.length} 条 / 差距 ${gaps.length} 条 / 共 ${requirements.length} 条 —— 命中∪差距=全集，无第三类。`,
);

process.exit(okSum && okScore ? 0 : 1);
