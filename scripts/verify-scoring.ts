// ============================================================================
// Phase 6B 真链路验收 harness（headless）
// ----------------------------------------------------------------------------
// 复用 100% 真实管线：parseResumeText(#7) + runCompile(#1/#2/#3/#8/#9) + scoring。
// 唯一改动：把 client.ts 里的 fetch("/api/gemini") 路由到 Google 直连，复刻
// functions/api/gemini.ts 的 passthrough（用 .dev.vars 里的 GEMINI_API_KEY）。
// 不碰任何 prompt / schema / scoring 逻辑——跑的就是 UI 背后那套。
//
// 跑法：npx tsx scripts/verify-scoring.ts
// ============================================================================

import { readFileSync } from "node:fs";

// ---- 1. /api/gemini → Google 直连（复刻代理）----
const devVars = readFileSync(new URL("../.dev.vars", import.meta.url), "utf8");
const km = devVars.match(/GEMINI_API_KEY\s*=\s*(.+)/);
if (!km) throw new Error("GEMINI_API_KEY 不在 .dev.vars 里");
const KEY = km[1].trim().replace(/^["']|["']$/g, "");
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

const realFetch = globalThis.fetch.bind(globalThis);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 节流：免费档 gemini-3.1-flash-lite 有 RPM 限制，且 1.5 fallback 已失效(404)。
// 串行 + 间隔，并在网络层对 429 退避重试——这样 primary 不会落到死掉的 fallback。
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
  chain = run.then(
    () => undefined,
    () => undefined,
  );
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
      return new Response(text, {
        status: res.status,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }
    const backoff = 7000 * (attempt + 1);
    console.warn(`[throttle] ${model} 429，退避 ${backoff}ms 后重试 (#${attempt + 1})`);
    await sleep(backoff);
  }
  return new Response(JSON.stringify({ error: { message: "429 exhausted" } }), {
    status: 429,
  });
}

(globalThis as any).fetch = async (input: any, init: any) => {
  if (typeof input === "string" && input.startsWith("/api/gemini")) {
    const body = JSON.parse((init?.body as string) ?? "{}");
    const { model, contents, ...rest } = body;
    // 只用可用的 primary 模型，绕开 1.5 死 fallback
    return schedule(() => googleCall("gemini-3.1-flash-lite", { contents, ...rest }));
  }
  return realFetch(input, init);
};

// ---- 2. 动态导入真实管线（patch 之后再导）----
const { parseResumeText } = await import("../src/lib/gemini/parse");
const { runCompile } = await import("../src/lib/compile");
const { buildMaster } = await import("../src/lib/resumeIntake");
const { computeMatchScore, computeSegmentRequirements, TIER_WEIGHT } =
  await import("../src/lib/scoring");
type CV = Awaited<ReturnType<typeof runCompile>>;
type Master = Awaited<ReturnType<typeof buildMaster>>;

// ---- 3. fixtures（用户提供的真实文本）----
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
- 协助高级分析师准备路演材料,参与上市公司实地调研 5 次

汇丰证券服务(HSBC Securities Services)  2021.01 - 2021.06
基金运营 实习生
- 负责每日基金净值(NAV)复核,处理 60+ 只基金的估值核对
- 用 VBA 编写自动化对账脚本,将每日 NAV 核对耗时从 2 小时压缩到 30 分钟

项目经历
AI 简历编译器(AI Resume Compiler)  2024.10 - 至今
个人独立项目 | 产品 + 全栈
- 提出"简历即可编译资产"的产品概念:母版-子版编译心智 + 三级信息来源标注(直接来源/推断/AI补充)
- 技术栈 React + Vite + TypeScript + Gemini API + Cloudflare Pages,设计 9 个分工明确的 Prompt 任务链
- 用 RAG + Multi-Agent 思路拆解"简历匹配→改写→差距分析→面试模拟"全流程

Coze + DeepSeek AI 分析助手  2024.05 - 2024.08
个人项目
- 基于 Coze 平台搭建金融舆情分析智能体,接入 DeepSeek 做摘要与情绪判断
- 跨部门协作收集一线投研人员需求,迭代 3 个版本的交互流程

技能
产品:需求分析、PRD 撰写、用户访谈、Prompt 工程、AI 产品流程设计
技术:Python、R、SQL 基础、Gemini/DeepSeek API、Cloudflare、Git
语言:粤语(母语)、普通话、英语(IELTS 6.5)、法语(基础)
证书:CFA 一级`;

const JD_A = `Job Title: AI Product Manager — Consumer Growth

About the role:
We are looking for an AI Product Manager to drive our consumer-facing
intelligent features. You will work at the intersection of product,
data science, and engineering to ship LLM-powered experiences at scale.

Responsibilities:
- Own the product roadmap for AI-driven personalization features
- Drive cross-functional collaboration across product, engineering,
  data science, and design teams
- Define and run A/B tests on our experimentation platform to validate
  feature impact
- Translate ambiguous business problems into clear PRDs and success metrics
- Partner with ML teams to improve recommendation systems and search ranking quality

Requirements:
- 3+ years of product management experience, ideally in consumer tech
- Hands-on experience with recommendation systems or search ranking
- Strong SQL skills and ability to work with large-scale data pipelines
- Proven track record of cross-functional collaboration with engineering and data teams
- Experience writing PRDs and defining product success metrics
- Familiarity with LLM / generative AI products is a strong plus
- Excellent written and verbal communication in English`;

const JD_B = `Job Title: AI Product Manager — FinTech / Intelligent Investing

About the role:
A fast-growing fintech company is hiring an AI Product Manager to build
LLM-powered tools for retail investors and financial analysts. The ideal
candidate combines a solid finance background with hands-on AI product experience.

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

// ---- 工具 ----
import { writeFileSync } from "node:fs";
const buf: string[] = [];
const line = (s = "") => {
  console.log(s);
  buf.push(s);
};
const flush = () =>
  writeFileSync(new URL("./verify-out.txt", import.meta.url), buf.join("\n"));
const hr = (t: string) =>
  line("\n" + "═".repeat(78) + "\n  " + t + "\n" + "═".repeat(78));

function bulletIndex(v: CV, master: Master) {
  const map = new Map<
    string,
    { rewritten: string; src: string; segTitle: string; iInSeg: number }
  >();
  for (const d of v.segmentDecisions) {
    const seg = master.segments.find((s) => s.id === d.segmentId);
    d.bullets.forEach((b, i) =>
      map.set(b.id, {
        rewritten: b.userEditedText ?? b.rewrittenText,
        src: b.sourceLevel,
        segTitle: seg?.title ?? "(?)",
        iInSeg: i,
      }),
    );
  }
  return map;
}

/** 找"唯红要求"：映射到的现存 bullet 全是 red（无绿/黄覆盖）→ 当前必不命中，
 *  正是红色门控的非平凡情形。返回该要求 + 一条承载它的红 bullet id。 */
function findRedOnlyReq(
  v: CV,
  reqs: any[],
  idx: ReturnType<typeof bulletIndex>,
) {
  for (const r of reqs) {
    const m = v.requirementMatches.find((x) => x.requirementId === r.id);
    const ids = (m?.bulletIds ?? []).filter((b) => idx.has(b));
    if (ids.length === 0) continue;
    const allRed = ids.every((b) => idx.get(b)!.src === "red");
    if (allRed) return { r, redId: ids.find((b) => idx.get(b)!.src === "red")! };
  }
  return null;
}

function proveRedGate(label: string, v: CV, reqs: any[], idx: ReturnType<typeof bulletIndex>) {
  const found = findRedOnlyReq(v, reqs, idx);
  if (!found) {
    line(`  ${label}：无"唯红要求"（红色都与绿/黄重叠）`);
    return false;
  }
  const { r, redId } = found;
  const matches = v.requirementMatches;
  const toggle = (action: "accept" | "reject" | null) =>
    computeMatchScore(
      v.segmentDecisions.map((d: any) => ({
        ...d,
        bullets: d.bullets.map((b: any) =>
          b.id === redId && action
            ? { ...b, redConfirmation: { confirmed: true, action, confirmedAt: "t" } }
            : b,
        ),
      })),
      reqs,
      matches,
    );
  const base = toggle(null);
  const acc = toggle("accept");
  const rej = toggle("reject");
  const hitOf = (s: any) => s.requirements.find((x: any) => x.id === r.id)?.hitNow;
  line(`  ${label}：唯红要求 [${r.importance}] "${r.text}"  (承载红 bullet ${redId})`);
  line(`    待确认(pending) scoreNow=${base.scoreNow}  该要求hit=${hitOf(base)}`);
  line(`    拒绝(reject)    scoreNow=${rej.scoreNow}  该要求hit=${hitOf(rej)}   ${rej.scoreNow === base.scoreNow && hitOf(rej) === false ? "✅ 该要求不命中、分数不涨" : "❌"}`);
  line(`    采纳(accept)    scoreNow=${acc.scoreNow}  该要求hit=${hitOf(acc)}   ${acc.scoreNow > base.scoreNow && hitOf(acc) === true ? "✅ 确认后点亮、分数上涨（非平凡门控成立）" : "❌"}`);
  return true;
}

// ============================================================================
async function main() {
  hr("#7 解析简历（真链路）");
  const parsed = await parseResumeText({ rawText: RESUME });
  const master = buildMaster(parsed, "A_master");
  line(`段落数 ${master.segments.length}：`);
  master.segments.forEach((s) => line(`  · [${s.type}] ${s.title}`));

  // ===== JD-A：①跨语言 + ②红色拒绝 =====
  hr("编译 JD-A（Consumer Growth）— 真链路 #1/#2/#3/#8/#9");
  const vA = await runCompile(master, {
    company: "(verify)",
    position: "AI Product Manager — Consumer Growth",
    rawText: JD_A,
  });
  const reqsA = vA.jobDescription.requirements ?? [];
  const idxA = bulletIndex(vA, master);
  const scoreA = computeMatchScore(vA.segmentDecisions, reqsA, vA.requirementMatches);

  line(`\n#8 提取要求 ${reqsA.length} 条：`);
  reqsA.forEach((r) =>
    line(`  [${r.importance.toUpperCase().padEnd(7)}] ${r.text}  (${r.id})`),
  );

  hr("① 跨语言命中：cross-functional collaboration ↔ 跨部门协作");
  const xreqs = reqsA.filter((r) =>
    r.text.toLowerCase().includes("cross-functional collaboration"),
  );
  if (xreqs.length === 0) {
    line("⚠️ #8 未提取到含 cross-functional collaboration 的要求 —— 如实报告，无法验①");
  }
  for (const r of xreqs) {
    const match = vA.requirementMatches.find((m) => m.requirementId === r.id);
    const bIds = match?.bulletIds ?? [];
    line(`\n要求 [${r.importance}] "${r.text}"`);
    line(`  #9 映射到 bullet：${bIds.length ? bIds.join(", ") : "(空)"}`);
    bIds.forEach((bid) => {
      const b = idxA.get(bid);
      const zh = b && b.rewritten.includes("跨部门协作");
      line(
        `    - [${b?.src}] 《${b?.segTitle}》 "${b?.rewritten}"  ${
          zh ? "✅含中文'跨部门协作'" : ""
        }`,
      );
    });
    const sr = scoreA.requirements.find((x) => x.id === r.id);
    line(
      `  → 评分判定：hitNow=${sr?.hitNow}  hitBefore=${sr?.hitBefore}  (hitNow=true 即右栏点亮变绿)`,
    );
  }

  // 右栏「本段 JD 要求命中」：找含跨部门协作 bullet 的那段，打印该段的 seg requirements
  hr("① 右栏「本段 JD 要求命中」联动（含'跨部门协作'的段）");
  for (const d of vA.segmentDecisions) {
    if (!d.bullets.some((b) => (b.userEditedText ?? b.rewrittenText).includes("跨部门协作")))
      continue;
    const seg = master.segments.find((s) => s.id === d.segmentId);
    const rows = computeSegmentRequirements(d, reqsA, vA.requirementMatches);
    line(`\n《${seg?.title}》本段命中行：`);
    rows.forEach((row) =>
      line(
        `  ${row.hit ? "✅" : row.pending ? "⏳" : "⬜"} ${row.phrase}${
          row.hit ? `  ← 由 bullet ${row.byBulletIndex} 命中` : ""
        }`,
      ),
    );
  }

  hr("② 红色拒绝 → 分数不涨");
  // 收集红 bullet → 映射到的要求
  const reds: { id: string; text: string; reqs: typeof reqsA }[] = [];
  for (const [bid, info] of idxA) {
    if (info.src !== "red") continue;
    const mappedReqIds = vA.requirementMatches
      .filter((m) => m.bulletIds.includes(bid))
      .map((m) => m.requirementId);
    const mappedReqs = reqsA.filter((r) => mappedReqIds.includes(r.id));
    reds.push({ id: bid, text: info.rewritten, reqs: mappedReqs });
  }
  line(`本次编译产出红色 bullet ${reds.length} 条：`);
  reds.forEach((rd) =>
    line(
      `  · ${rd.id} "${rd.text}"  → 满足要求: ${
        rd.reqs.map((r) => `[${r.importance}]${r.text}`).join(" | ") || "(无映射)"
      }`,
    ),
  );
  const redHard = reds.find((rd) => rd.reqs.some((r) => r.importance === "hard"));
  if (!redHard) {
    line("\n⚠️ 没有红色 bullet 被 #9 判定满足某【hard】门槛 —— 如实报告，不硬凑。");
    const redAny = reds.find((rd) => rd.reqs.length > 0);
    if (redAny) line(`  （退而验：用映射到要求的红 bullet ${redAny.id} 看拒绝是否不涨）`);
    await testRedToggle(vA, reqsA, redAny);
  } else {
    line(`\n选中红 bullet ${redHard.id}（满足 hard 门槛）做拒绝测试：`);
    await testRedToggle(vA, reqsA, redHard);
  }

  // ===== JD-B：③强匹配 =====
  hr("编译 JD-B（FinTech / Intelligent Investing）— 真链路");
  const vB = await runCompile(master, {
    company: "(verify)",
    position: "AI Product Manager — FinTech / Intelligent Investing",
    rawText: JD_B,
  });
  const reqsB = vB.jobDescription.requirements ?? [];
  const scoreB = computeMatchScore(vB.segmentDecisions, reqsB, vB.requirementMatches);
  const hitCount = scoreB.requirements.filter((r) => r.hitNow).length;

  hr("③ 强匹配分数 + 命中/总要求 + 权重明细");
  line(`双环：改写前 ${scoreB.scoreBefore}  →  当前 ${scoreB.scoreNow}  (Δ+${scoreB.delta})`);
  line(`命中要求 ${hitCount} / 总要求 ${scoreB.requirements.length}`);
  line(`加权：命中权重 ${scoreB.hitWeightNow} / 总权重 ${scoreB.totalWeight}`);
  line(`权重档：Hard=${TIER_WEIGHT.hard}  Title=${TIER_WEIGHT.title}  Context=${TIER_WEIGHT.context}`);
  line(`\n逐条：`);
  scoreB.requirements.forEach((r) =>
    line(
      `  ${r.hitNow ? "✅" : "⬜"} [${r.importance.toUpperCase().padEnd(7)} w=${r.weight}] ${r.label}`,
    ),
  );

  hr("② 补强：红色门控非平凡情形（唯红要求：拒→不亮不涨 / 采纳→点亮上涨）");
  const idxB = bulletIndex(vB, master);
  const okA = proveRedGate("JD-A", vA, reqsA, idxA);
  if (!okA) proveRedGate("JD-B", vB, reqsB, idxB);
}

function testRedToggle(v: CV, reqs: any, red: any) {
  if (!red) {
    line("  （无可测红 bullet）");
    return;
  }
  const base = computeMatchScore(v.segmentDecisions, reqs, v.requirementMatches);
  const withConf = (action: "accept" | "reject") =>
    v.segmentDecisions.map((d: any) => ({
      ...d,
      bullets: d.bullets.map((b: any) =>
        b.id === red.id
          ? { ...b, redConfirmation: { confirmed: true, action, confirmedAt: "t" } }
          : b,
      ),
    }));
  const acc = computeMatchScore(withConf("accept"), reqs, v.requirementMatches);
  const rej = computeMatchScore(withConf("reject"), reqs, v.requirementMatches);
  line(`  待确认(pending)   scoreNow = ${base.scoreNow}`);
  line(`  拒绝(reject)      scoreNow = ${rej.scoreNow}   ${rej.scoreNow === base.scoreNow ? "✅ 纹丝不动" : "❌ 动了"}`);
  line(`  采纳(accept)      scoreNow = ${acc.scoreNow}   ${acc.scoreNow > base.scoreNow ? "✅ 采纳才涨（证明确实映射了真要求）" : "（未涨）"}`);
}

main()
  .then(flush)
  .catch((e) => {
    line("\n❌ harness 失败：" + (e?.message || e));
    flush();
    process.exit(1);
  });
