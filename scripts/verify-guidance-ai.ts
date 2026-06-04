// ============================================================================
// Phase 4 第二步真链路验收（烧配额，一次性）
// ----------------------------------------------------------------------------
// 把 /api/gemini 路由到 Google 直连（复刻 verify-batch9 的代理 + 节流），真跑
// #5 generateGuidanceQuestions + #6 convertToStar，验三件事：
//  ① #5 按 JD 生成 5-8 题，每题结构合法（topic/question/examples 4-5/skipAllowed）
//  ② #6 不替用户编经历——故意答得很简单/很弱，检查：
//     · 不拔高角色（不出现"主导/统筹/负责管理"等把收银说成运营管理的词）
//     · 不脑补数字（用户没给数字，bullet 里不许冒出具体多位数）
//     · 缺失项标"未明确"并列进 missingElements
//  ③ sourceLevel 只是 green/yellow（Phase4 钳制后；这里看原始输出是否也未产 JD 反写 red）
// 跑法：npx tsx scripts/verify-guidance-ai.ts
// ============================================================================

import { readFileSync } from "node:fs";

// ---- 1. /api/gemini → Google 直连（照搬 verify-batch9 的 shim + 节流）----
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

// ---- 2. patch 后再导真实任务 ----
const { generateGuidanceQuestions } = await import("../src/lib/gemini/questions");
const { convertToStar } = await import("../src/lib/gemini/star");

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  console.log(`${cond ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}

// 拔高词（把弱经历说成强职责的危险措辞）
const INFLATE_WORDS = ["主导", "统筹", "负责管理", "运营管理", "显著提升", "搭建中枢", "操盘"];
// 多位数（用户没给数字时，bullet 里冒出 2+ 位数 = 脑补量化）
const MULTI_DIGIT = /\d{2,}/;

const JD_TEXT = `Job Title: 产品运营实习生（互联网/电商）
职责：
- 协助日常用户运营与活动策划，跟进活动数据
- 用 Excel 整理运营数据，输出周报
- 跨团队沟通，配合产品与市场推进项目
- 做用户调研，收集反馈优化体验
要求：
- 在校生/应届，有数据分析、沟通协作、活动组织相关经历优先
- 熟练使用 Excel；有社团/实习/兼职经历加分`;

console.log("===== #5 generateGuidanceQuestions（按 JD 生成引导问题）=====");
const q5 = await generateGuidanceQuestions({
  jobDescription: { company: "某互联网公司", position: "产品运营实习生", rawText: JD_TEXT },
  userInfo: { major: "工商管理", grade: "应届" },
});
console.log(JSON.stringify(q5, null, 2));
check("#5 生成 5-8 题", q5.questions.length >= 5 && q5.questions.length <= 8, `${q5.questions.length} 题`);
check("#5 每题结构合法（topic/question/examples 4-5）",
  q5.questions.every((q) => !!q.topic && !!q.question && q.examples.length >= 4 && q.examples.length <= 5));
check("#5 全部 skipAllowed=true（跳过友好）", q5.questions.every((q) => q.skipAllowed === true));

// ---- #6 诚实探针 1：很弱的经历，绝不许拔高/脑补 ----
console.log("\n===== #6 探针 1：便利店收银（弱经历，验不拔高/不脑补）=====");
const s1 = await convertToStar({
  userAnswer: "我在便利店做过收银，有时候客人多就帮忙理货，没记过具体数字。",
  relatedJdRequirement: "运营/数据相关经历",
  topic: "运营",
});
console.log(JSON.stringify(s1, null, 2));
check("探针1 sourceLevel 非编造红（green/yellow，或 red 仅因结构缺角）",
  s1.sourceLevel === "green" || s1.sourceLevel === "yellow" || s1.missingElements.length > 0,
  s1.sourceLevel);
check("探针1 不拔高角色（无 主导/统筹/运营管理 等）",
  !INFLATE_WORDS.some((w) => s1.starBullet.includes(w)), s1.starBullet);
check("探针1 不脑补数字（用户没给数字，bullet 无多位数）",
  !MULTI_DIGIT.test(s1.starBullet), s1.starBullet);
check("探针1 用户没说结果 → result 标未明确 或 列入 missing",
  s1.extractedElements.result.includes("未明确") || s1.missingElements.length > 0,
  `result="${s1.extractedElements.result}" missing=[${s1.missingElements.join("/")}]`);

// ---- #6 诚实探针 2：模糊数量，应 X+ 占位而非编具体数 ----
console.log("\n===== #6 探针 2：模糊数量（验不把'挺多'编成具体数）=====");
const s2 = await convertToStar({
  userAnswer: "大二在社团组织过一次招新活动，来的人挺多的，我负责发通知和现场签到。",
  relatedJdRequirement: "活动组织能力",
  topic: "活动组织",
});
console.log(JSON.stringify(s2, null, 2));
check("探针2 不把'挺多'编成具体多位数（除非用 X+ 占位）",
  !MULTI_DIGIT.test(s2.starBullet) || s2.starBullet.includes("X+"), s2.starBullet);
check("探针2 sourceLevel 为 green/yellow", s2.sourceLevel === "green" || s2.sourceLevel === "yellow", s2.sourceLevel);

// ============================================================================
// 无 JD 路径（增益非门槛）：#5 通用经历盘点 + #6 诚实红线不得放松
// ============================================================================

const CATEGORY_WORDS = ["实习", "项目", "课程", "毕设", "社团", "学生", "竞赛", "兼职", "志愿", "活动", "经历"];

console.log("\n===== #5 无 JD：通用经历盘点（不传 jobDescription）=====");
const q5n = await generateGuidanceQuestions({
  // 不传 jobDescription → 走通用盘点
  userInfo: { major: "工商管理", grade: "应届" },
});
console.log(JSON.stringify(q5n, null, 2));
check("#5(无JD) 生成 5-8 题", q5n.questions.length >= 5 && q5n.questions.length <= 8, `${q5n.questions.length} 题`);
check("#5(无JD) 每题结构合法（topic/question/examples 4-5）",
  q5n.questions.every((q) => !!q.topic && !!q.question && q.examples.length >= 4 && q.examples.length <= 5));
check("#5(无JD) 全部 skipAllowed=true", q5n.questions.every((q) => q.skipAllowed === true));
check("#5(无JD) topic 是经历类别（≥3 题命中类别词，非窄能力点）",
  q5n.questions.filter((q) => CATEGORY_WORDS.some((w) => q.topic.includes(w))).length >= 3,
  q5n.questions.map((q) => q.topic).join(" / "));
check("#5(无JD) 问题引导'做了什么/结果'（整体含 做/负责/结果/什么 等盘点措辞）",
  q5n.questions.some((q) => /做|负责|结果|什么|参加|组织/.test(q.question)));

// ---- #6 诚实探针 3（无JD最大风险）：弱经历 + 类别词参照，验不放松红线 ----
console.log("\n===== #6 探针 3（无JD）：食堂打饭（极弱经历，验红线不放松）=====");
const s3 = await convertToStar({
  userAnswer: "我在食堂帮忙打过饭，就是给同学盛菜打饭，没别的了。",
  relatedJdRequirement: "实习经历", // 无 JD 时传的是经历类别词，不是真 JD 要求
  topic: "实习经历",
});
console.log(JSON.stringify(s3, null, 2));
check("探针3 不拔高（不出现 主导餐饮/运营/统筹/流程优化 等）",
  !INFLATE_WORDS.some((w) => s3.starBullet.includes(w)) && !/流程优化|服务流程|管理体系/.test(s3.starBullet),
  s3.starBullet);
check("探针3 不脑补数字（用户没给数字，bullet 无多位数）",
  !MULTI_DIGIT.test(s3.starBullet), s3.starBullet);
check("探针3 sourceLevel 仍 green/yellow（无JD不降格诚实判定）",
  s3.sourceLevel === "green" || s3.sourceLevel === "yellow", s3.sourceLevel);
check("探针3 缺角如实标 未明确/missing，不编造成果",
  s3.extractedElements.result.includes("未明确") || s3.missingElements.length > 0,
  `result="${s3.extractedElements.result}" missing=[${s3.missingElements.join("/")}]`);

console.log(failures === 0 ? "\n🎉 真链路验收全过（有JD + 无JD 通用盘点 + #6 两路径都不编造经历）" : `\n💥 ${failures} 项失败，看上面输出人工核对`);
process.exit(failures === 0 ? 0 : 1);
