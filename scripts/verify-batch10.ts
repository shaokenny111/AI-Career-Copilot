// ============================================================================
// Batch 10 真链路重编译（烧配额，一次性）——麦肯锡 case 中英文两版
// ----------------------------------------------------------------------------
// 验证待办 2/3 的 prompt 收紧是否生效：
//  · 待办2 #9：en/cn 版 "2+年领导数字产品经验" 不再被数据/技能 bullet 假阳性命中 → 落差距
//  · 待办3 #1：en/cn 版 "构建产品愿景/推动竞争分析" 黄色过度延伸 → 不再以 yellow 虚撑
//
// 复用 100% 真实管线（runCompile：#1/#2/#8/#9/#3 + scoring），/api/gemini 路由到
// Google 直连（复刻 verify-batch9 的节流 + 退避）。母版直接读 storage.json 里用户本地
// 编译过的同一份 master（不再跑 #7 解析，省配额、且保证"同 case"完全一致）。
// 编译产物写入 scripts/batch10-storage.json，随后用 diagnose-version.ts 两版重跑。
// 跑法：npx tsx scripts/verify-batch10.ts
// ============================================================================

import { readFileSync, writeFileSync } from "node:fs";

// ---- 1. /api/gemini → Google 直连（照搬 verify-batch9 的代理 + 节流）----
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

// ---- 2. 真实管线 ----
const { runCompile } = await import("../src/lib/compile");
import type { Master } from "../src/types";

// ---- 3. 母版：直接取 storage.json 里用户本地编译过的同一份 master ----
const storage = JSON.parse(readFileSync(new URL("../storage.json", import.meta.url), "utf8"));
const master: Master = storage.master;
if (!master?.segments?.length) throw new Error("storage.json 里没有 master.segments");

// ---- 4. 同一 JD 中英文两版（与本地 case 完全一致）----
const JD_EN = `YOUR QUALIFICATIONS AND SKILLS
Undergraduate degree with outstanding academic achievements required; advanced degree or MBA are nice to have
2+ years of experience in leading the planning, design, and scaling of digital products (especially AI-embedded products, big data analysis, and algorithms)
Proven record of leadership in an academic, professional, or extracurricular setting
Strong product instinct and ability to drive competitive analyses to build great product vision and roadmap, with success stories
Strong data and analytical abilities with a passion in the latest trends of tech and AI
Exceptional analytical and conceptual problem-solving ability
Ability to work collaboratively in a team environment and effectively with people at all levels in an organization
Ability to communicate complex ideas effectively, both verbally and in writing, in English and Chinese`;

const JD_CN = `您的资历与技能
要求拥有具有杰出学术成就的本科学位;高级学位或MBA是加分项
拥有2+年领导数字产品（尤其是AI嵌入式产品、大数据分析和算法）规划、设计和扩展的经验
在学术、专业或课外环境中展现出卓越的领导力记录
具备强烈的产品直觉和推动竞争分析的能力，以构建出色的产品愿景和路线图，并拥有成功案例
具备强大的数据和分析能力，热衷于最新科技和人工智能趋势
卓越的分析和概念性问题解决能力
能够在团队环境中协作，并有效地与组织各级人员协作
能够有效地用英语和中文口头和书面方式传达复杂思想`;

const POS_EN = "Business Analyst/Junior Associate - Tech & AI (AI focus)";
const POS_CN = "业务分析师/初级助理 - 技术与人工智能（专注于人工智能）";

async function main() {
  console.log("重编译 EN（McKinsey）…");
  const enVer = await runCompile(master, { company: "McKinsey", position: POS_EN, rawText: JD_EN });
  console.log("重编译 CN（麦肯锡）…");
  const cnVer = await runCompile(master, { company: "麦肯锡", position: POS_CN, rawText: JD_CN });

  // 标记便于 diagnose 指定
  enVer.id = "batch10_en";
  cnVer.id = "batch10_cn";

  const out = { schemaVersion: storage.schemaVersion ?? 1, master, compiledVersions: [enVer, cnVer] };
  writeFileSync(new URL("./batch10-storage.json", import.meta.url), JSON.stringify(out, null, 2));
  console.log("\n✅ 已写入 scripts/batch10-storage.json（含 batch10_en / batch10_cn 两版）");
  console.log("接着跑：");
  console.log("  npx tsx scripts/diagnose-version.ts scripts/batch10-storage.json batch10_en");
  console.log("  npx tsx scripts/diagnose-version.ts scripts/batch10-storage.json batch10_cn");
}

main().catch((e) => { console.error("\n❌ harness 失败：" + (e?.message || e)); process.exit(1); });
