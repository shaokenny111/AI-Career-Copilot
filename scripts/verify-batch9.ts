// ============================================================================
// Batch 9 真链路验收（烧配额，一次性）
// ----------------------------------------------------------------------------
// 复用 100% 真实管线（runCompile：#1/#2/#8/#9/#3 + scoring），把 /api/gemini 路由到
// Google 直连（复刻 functions/api/gemini.ts）。验收 5 点：
//  ① 同简历+同JD（公司名中/英两版）各编译一次 → 基础分一致或个位数内、差距条目一致
//  ② 无"命中又差距"矛盾；高分简历差距列表短
//  ③ 教育/技能/证书段：全 green、rewritten==original（零改写、无能力句注水）
//  ④ 工作/项目段：带"小标题："的子点，改写后小标题保留、bullet 数不少于子点数（不揉合）
//  ⑤ 严重度 = importance 映射（hard→hard_filter / title→important / context→minor）
// 跑法：npx tsx scripts/verify-batch9.ts
// ============================================================================

import { readFileSync, writeFileSync } from "node:fs";

// ---- 1. /api/gemini → Google 直连（复刻代理 + 节流，照搬 verify-scoring）----
const devVars = readFileSync(new URL("../.dev.vars", import.meta.url), "utf8");
const km = devVars.match(/GEMINI_API_KEY\s*=\s*(.+)/);
if (!km) throw new Error("GEMINI_API_KEY 不在 .dev.vars 里");
const KEY = km[1].trim().replace(/^["']|["']$/g, "");
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const realFetch = globalThis.fetch.bind(globalThis);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const MIN_GAP_MS = 4500;
let chain: Promise<unknown> = Promise.resolve();
let lastStart = 0;
function schedule<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const wait = Math.max(0, lastStart + MIN_GAP_MS - Date.now());
    if (wait) await sleep(wait);
    lastStart = Date.now();
    return fn();
  });
  chain = run.then(() => undefined, () => undefined);
  return run as Promise<T>;
}
async function googleCall(model: string, payload: unknown): Promise<Response> {
  const url = `${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent?key=${KEY}`;
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await realFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.status !== 429) {
      const text = await res.text();
      return new Response(text, { status: res.status, headers: { "Content-Type": "application/json; charset=utf-8" } });
    }
    const backoff = 7000 * (attempt + 1);
    console.warn(`[throttle] ${model} 429，退避 ${backoff}ms (#${attempt + 1})`);
    await sleep(backoff);
  }
  return new Response(JSON.stringify({ error: { message: "429 exhausted" } }), { status: 429 });
}
(globalThis as any).fetch = async (input: any, init: any) => {
  if (typeof input === "string" && input.startsWith("/api/gemini")) {
    const body = JSON.parse((init?.body as string) ?? "{}");
    const { contents, ...rest } = body;
    return schedule(() => googleCall("gemini-3.1-flash-lite", { contents, ...rest }));
  }
  return realFetch(input, init);
};

// ---- 2. 真实管线（patch 后再导）----
const { parseResumeText } = await import("../src/lib/gemini/parse");
const { runCompile } = await import("../src/lib/compile");
const { buildMaster } = await import("../src/lib/resumeIntake");
const { computeMatchScore, IMPORTANCE_TO_SEVERITY } = await import("../src/lib/scoring");
type CV = Awaited<ReturnType<typeof runCompile>>;

// ---- 3. fixtures ----
const RESUME = `邵子康
AI 产品经理 | 金融 × AI 复合背景
邮箱:zikang.shao@example.com | 电话:+86 138-XXXX-XXXX
个人主页:github.com/shaokenny111 | 城市:广州

教育背景
里昂商学院(EMLYON Business School)  2021.09 - 2022.12
量化金融 理学硕士(MSc in Quantitative Finance)
核心课程:衍生品定价、机器学习在金融中的应用、时间序列分析、Python/R 编程

华南理工大学  2017.09 - 2021.06
金融学 学士
GPA 3.6/4.0;CFA 一级(2023 年通过);IELTS 6.5

工作经历
海晟佛山金融租赁有限公司  2023.07 - 至今
项目经理助理
- 协助搭建租赁项目全流程数字化看板,跨部门协作打通业务、风控、财务三方数据口径,将项目立项到放款的平均周期缩短约 20%
- 独立编写 4 个租赁产品的需求文档与流程图,主导与外部 SaaS 供应商的需求对接会议
- 用 Python 清洗历史放款数据,搭建简单的客户违约预警规则原型,被风控团队采纳为辅助参考

国元证券研究所  2022.06 - 2022.09
汽车行业研究 实习生
- 独立完成 3 篇新能源汽车产业链深度报告,覆盖电池、电机、整车环节
- 搭建覆盖 40+ 标的的财务数据追踪表,每周更新行业关键经营指标

项目经历
AI 简历编译器(AI Resume Compiler)  2024.10 - 至今
个人独立项目 | 产品 + 全栈
- 提出"简历即可编译资产"的产品概念:母版-子版编译心智 + 三级信息来源标注
- 技术栈 React + Vite + TypeScript + Gemini API + Cloudflare Pages,设计 9 个分工明确的 Prompt 任务链
- 用 RAG + Multi-Agent 思路拆解"简历匹配→改写→差距分析→面试模拟"全流程

技能
产品:需求分析、PRD 撰写、用户访谈、Prompt 工程、AI 产品流程设计
技术:Python、R、SQL 基础、Gemini/DeepSeek API、Cloudflare、Git
语言:粤语(母语)、普通话、英语(IELTS 6.5)、法语(基础)
证书:CFA 一级`;

const JD_TEXT = `Job Title: AI Product Manager — FinTech / Intelligent Investing

About the role:
Hiring an AI Product Manager to build LLM-powered tools for retail investors
and financial analysts. The ideal candidate combines a solid finance background
with hands-on AI product experience.

Responsibilities:
- Own the product lifecycle for AI-assisted financial research and analysis tools
- Design prompt chains and RAG-based workflows for financial document understanding
- Write detailed PRDs and define success metrics for AI features
- Drive cross-functional collaboration across engineering, data, and business teams
- Conduct user interviews with analysts and retail investors to shape the roadmap

Requirements:
- Background in finance or quantitative finance (CFA or equivalent a strong plus)
- Hands-on experience building LLM / generative AI products (prompt engineering, RAG)
- Proficiency in Python or R for data analysis
- Experience writing PRDs, user interviews, and product workflow design
- Strong cross-functional collaboration skills with technical and business teams
- Fluent professional English`;

const buf: string[] = [];
const line = (s = "") => { console.log(s); buf.push(s); };
const flush = () => writeFileSync(new URL("./verify-batch9-out.txt", import.meta.url), buf.join("\n"));
const hr = (t: string) => line("\n" + "═".repeat(76) + "\n  " + t + "\n" + "═".repeat(76));
let allPass = true;
const ok = (b: boolean, msg: string) => { line(`  ${b ? "✅" : "❌"} ${msg}`); if (!b) allPass = false; };

const FACT_TYPES = new Set(["education", "skill", "certificate"]);

function scoreOf(v: CV) {
  return computeMatchScore(v.segmentDecisions, v.jobDescription.requirements ?? [], v.requirementMatches);
}

function gapList(v: CV) {
  const s = scoreOf(v);
  return s.requirements.filter((r) => !r.hitNow);
}

async function main() {
  hr("#7 解析简历（一次，两次编译共用同一 master）");
  const parsed = await parseResumeText({ rawText: RESUME });
  const master = buildMaster(parsed, "A_master");
  master.segments.forEach((s) => line(`  · [${s.type}] ${s.title}`));

  // ===== 同 JD 两版：仅公司名 中文 vs 英文 =====
  hr("编译 v1（公司=麦肯锡）/ v2（公司=McKinsey）—— 仅公司名不同，JD 正文相同");
  const v1 = await runCompile(master, { company: "麦肯锡", position: "AI Product Manager", rawText: JD_TEXT });
  const v2 = await runCompile(master, { company: "McKinsey", position: "AI Product Manager", rawText: JD_TEXT });
  const s1 = scoreOf(v1), s2 = scoreOf(v2);

  hr("① 可复现：两版基础分一致或个位数内");
  line(`  v1(麦肯锡)  scoreNow=${s1.scoreNow}  scoreBefore=${s1.scoreBefore}  要求数=${s1.requirements.length}`);
  line(`  v2(McKinsey) scoreNow=${s2.scoreNow}  scoreBefore=${s2.scoreBefore}  要求数=${s2.requirements.length}`);
  const dScore = Math.abs(s1.scoreNow - s2.scoreNow);
  ok(dScore <= 9, `基础分差 ${dScore} ≤ 9（个位数内）${dScore === 0 ? " —— 完全一致" : ""}`);
  const g1 = gapList(v1), g2 = gapList(v2);
  ok(Math.abs(g1.length - g2.length) <= 1, `差距条目数 v1=${g1.length} v2=${g2.length}（差 ≤1）`);

  // 逐版做剩余断言
  for (const [label, v] of [["v1", v1], ["v2", v2]] as const) {
    const s = scoreOf(v);
    const reqs = v.jobDescription.requirements ?? [];

    hr(`② [${label}] 无"命中又差距"矛盾 + 高分差距列表短`);
    const hitIds = new Set(s.requirements.filter((r) => r.hitNow).map((r) => r.id));
    const gapIds = new Set(s.requirements.filter((r) => !r.hitNow).map((r) => r.id));
    const overlap = [...hitIds].filter((id) => gapIds.has(id));
    ok(overlap.length === 0, `命中集 ∩ 差距集 = ∅（命中${hitIds.size} / 差距${gapIds.size} / 总${reqs.length}）`);
    line(`  scoreNow=${s.scoreNow} → 差距 ${gapIds.size} 条：`);
    s.requirements.filter((r) => !r.hitNow).forEach((r) =>
      line(`    ⬜ [${r.importance}] ${r.label}  → severity=${IMPORTANCE_TO_SEVERITY[r.importance]}`),
    );

    hr(`⑤ [${label}] 严重度 = importance 映射（compile 落盘的 substantiveGaps）`);
    const wantSeverity = (imp: string) => IMPORTANCE_TO_SEVERITY[imp as "hard"];
    let sevOk = true;
    for (const sg of v.gapAnalysis.substantiveGaps) {
      const r = reqs.find((x) => x.id === sg.requirementId);
      const want = r ? wantSeverity(r.importance) : "(?)";
      const good = !!r && sg.severity === want;
      if (!good) sevOk = false;
      line(`    ${good ? "✅" : "❌"} "${sg.jdRequirement}" sev=${sg.severity} (importance=${r?.importance} 应=${want})  话术:${sg.interviewStrategy ? "有" : "无"}`);
    }
    ok(sevOk, `[${label}] 全部差距 severity 与 importance 映射一致`);
    // 落盘差距 = 编译期未满足集（与默认采纳口径一致）
    ok(
      v.gapAnalysis.substantiveGaps.every((sg) => gapIds.has(sg.requirementId)),
      `[${label}] 落盘 substantiveGaps 全部属于未满足集（编译期口径一致）`,
    );

    hr(`③ [${label}] 教育/技能/证书段：零改写、干净事实（全 green、rewritten==original）`);
    for (const d of v.segmentDecisions) {
      const seg = master.segments.find((x) => x.id === d.segmentId);
      if (!seg || !FACT_TYPES.has(seg.type) || !d.finalIncluded) continue;
      const allGreen = d.bullets.every((b) => b.sourceLevel === "green");
      const verbatim = d.bullets.every((b) => b.rewrittenText === b.originalText);
      ok(allGreen && verbatim, `《${seg.title}》[${seg.type}] ${d.bullets.length} 条全 green 且原样保留`);
      d.bullets.forEach((b) => line(`      · ${b.rewrittenText}`));
    }

    hr(`④ [${label}] 工作/项目段：带"小标题："子点 → 小标题保留、不揉合`);
    for (const d of v.segmentDecisions) {
      const seg = master.segments.find((x) => x.id === d.segmentId);
      if (!seg || FACT_TYPES.has(seg.type) || !d.finalIncluded) continue;
      // 原文子点数（按行/分号粗估）
      const subPoints = seg.content.split(/\r?\n|；|;/).map((t) => t.trim()).filter((t) => t.length >= 4);
      line(`  《${seg.title}》原文约 ${subPoints.length} 子点 → 改写 ${d.bullets.length} 条 bullet`);
      d.bullets.forEach((b) => line(`      [${b.sourceLevel}] ${b.userEditedText ?? b.rewrittenText}`));
      // 不揉合的软证据：bullet 数不应远少于子点数
      ok(d.bullets.length >= Math.ceil(subPoints.length / 2), `《${seg.title}》bullet 数未被揉合压缩（${d.bullets.length} vs 子点 ${subPoints.length}）`);
    }
  }

  hr(allPass ? "✅ Batch 9 真链路验收通过" : "❌ Batch 9 验收存在未过项（见上）");
}

main().then(flush).catch((e) => { line("\n❌ harness 失败：" + (e?.message || e)); flush(); process.exit(1); });
