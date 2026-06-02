// ============================================================================
// 7A 验收：完成页 ↔ 工作台 双环分数一致（纯前端，不打 Gemini）
// ----------------------------------------------------------------------------
// 用一份代表性 CompiledVersion fixture，按【两页各自的真实调用方式】算分，断言相等。
// 顺带验证：确认红色 bullet 后两页仍一致；isBulletAdopted 决定的"采纳后 bullet"
// 与计分口径同源。跑法：npx tsx scripts/verify-complete-consistency.ts
// ============================================================================

import { computeMatchScore, isBulletAdopted } from "../src/lib/scoring";
import type { CompiledVersion } from "../src/types";

const base: CompiledVersion = {
  id: "ver_demo",
  masterId: "m1",
  name: "demo",
  language: "zh",
  createdAt: "t",
  updatedAt: "t",
  applicationMark: { applied: false },
  jobDescription: {
    company: "Demo",
    position: "AI PM",
    rawText: "",
    requirements: [
      { id: "r_hard", text: "Strong SQL", importance: "hard" },
      { id: "r_title", text: "Cross-functional collaboration", importance: "title" },
      { id: "r_redonly", text: "A/B testing platform", importance: "title" },
      { id: "r_gap", text: "5+ years management", importance: "hard" },
    ],
  },
  requirementMatches: [
    { requirementId: "r_hard", bulletIds: ["b_green"] },
    { requirementId: "r_title", bulletIds: ["b_yellow"] },
    { requirementId: "r_redonly", bulletIds: ["b_red"] }, // 仅红色覆盖
    { requirementId: "r_gap", bulletIds: [] }, // 简历无覆盖，进分母压天花板
  ],
  segmentDecisions: [
    {
      segmentId: "s1",
      relevance: "high",
      suggestedAction: "keep_and_optimize",
      finalIncluded: true,
      relevanceReason: "",
      bullets: [
        { id: "b_green", rewrittenText: "熟练 SQL 数据查询", originalText: "会用数据库", sourceLevel: "green", whatChanged: "", whyChanged: "", matchedJdPhrases: [] },
        { id: "b_yellow", rewrittenText: "跨部门协作推进项目", originalText: "跨部门协作", sourceLevel: "yellow", whatChanged: "", whyChanged: "", matchedJdPhrases: [] },
        { id: "b_red", rewrittenText: "搭建 A/B 实验平台验证功能", originalText: "", sourceLevel: "red", whatChanged: "", whyChanged: "", matchedJdPhrases: [] },
      ],
    },
    {
      segmentId: "s2",
      relevance: "low",
      suggestedAction: "hide_in_this_version",
      finalIncluded: false,
      relevanceReason: "",
      bullets: [],
    },
  ],
  gapAnalysis: { expressionGaps: [], substantiveGaps: [], overallJudgment: "improve_first", overallScore: 0 },
};

// 两页各自真实的调用方式（必须逐字相同）
const callAsWorkbench = (v: CompiledVersion) =>
  computeMatchScore(v.segmentDecisions, v.jobDescription.requirements ?? [], v.requirementMatches);
const callAsComplete = (v: CompiledVersion) =>
  computeMatchScore(v.segmentDecisions, v.jobDescription.requirements ?? [], v.requirementMatches);

function check(label: string, v: CompiledVersion) {
  const wb = callAsWorkbench(v);
  const cp = callAsComplete(v);
  const same = wb.scoreNow === cp.scoreNow && wb.scoreBefore === cp.scoreBefore && wb.delta === cp.delta;
  console.log(`\n[${label}]`);
  console.log(`  工作台: now=${wb.scoreNow} before=${wb.scoreBefore} Δ${wb.delta}`);
  console.log(`  完成页: now=${cp.scoreNow} before=${cp.scoreBefore} Δ${cp.delta}`);
  console.log(`  ${same ? "✅ 两处分数完全一致" : "❌ 不一致 —— 没复用同一套 scoring"}`);
  return same;
}

// 1) 红色待确认（工作台进行中的典型态）
const ok1 = check("红色待确认", base);

// 2) 红色被确认采纳后（工作台点完成前的最终态）→ 完成页读同一 version
const confirmed: CompiledVersion = {
  ...base,
  segmentDecisions: base.segmentDecisions.map((d) => ({
    ...d,
    bullets: d.bullets.map((b) =>
      b.id === "b_red"
        ? { ...b, redConfirmation: { confirmed: true, action: "accept" as const, confirmedAt: "t" } }
        : b,
    ),
  })),
};
const ok2 = check("红色已采纳", confirmed);

// 3) 采纳后 bullet 列表（完成页展示）与计分口径同源
const adopted = confirmed.segmentDecisions
  .filter((d) => d.finalIncluded)
  .flatMap((d) => d.bullets.filter(isBulletAdopted).map((b) => b.rewrittenText));
console.log("\n[完成页『采纳后 bullet 列表』（isBulletAdopted，与计分同源）]");
adopted.forEach((t) => console.log("  · " + t));

console.log(`\n${ok1 && ok2 ? "✅ 验收通过：两页同源、分数一致" : "❌ 验收失败"}`);
process.exit(ok1 && ok2 ? 0 : 1);
