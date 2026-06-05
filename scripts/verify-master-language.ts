// ============================================================================
// 母版语言诚实化验收（零配额，不打 Gemini）
// ----------------------------------------------------------------------------
// 证明：language 字段由真实内容检测得出，而非硬编码 "zh"。覆盖三条建母版路径：
//  ① A/B 主线 buildMaster(中文内容) → zh
//  ② A/B 主线 buildMaster(英文内容) → en
//  ③ C 类 assembleGuidanceMaster(英文归集) → en（与 A/B 同走 buildMaster）
// 另：子版 language 继承 master.language（compile.ts: `language: master.language`，
//     确定性拷贝，无 AI），故母版判对 = 子版判对。
// 跑法：npx tsx scripts/verify-master-language.ts
// ============================================================================

import { buildMaster } from "../src/lib/resumeIntake";
import { assembleGuidanceMaster, type GuidanceBullet, type SegmentDraft } from "../src/lib/guidanceIntake";
import { detectContentLang } from "../src/lib/lang";
import type { BasicInfo, ParsedSegment } from "../src/types";

let failures = 0;
const ok = (name: string, cond: boolean, detail?: string) => {
  console.log(`  ${cond ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
};

const basic: BasicInfo = { name: "Test", email: "t@x.com", phone: "10000000000" };

console.log("① detectContentLang 纯函数");
ok("中文为主 → zh", detectContentLang("负责跨部门协作，撰写行业研究报告") === "zh");
ok("英文为主 → en", detectContentLang("Led cross-functional collaboration and wrote reports") === "en");
ok("英文夹个别中文工具名仍 → en", detectContentLang("Built dashboards with SQL; 钉钉 integration") === "en");

console.log("\n② A/B 主线 buildMaster —— 中文母版");
const zhSegs: ParsedSegment[] = [
  { type: "work", title: "国元证券 行业研究实习", content: "参与汽车行业研究，撰写研究报告，对板块进行投资分析。", timeRange: { start: "2024-06", end: "2024-09" }, isCurrent: false, tags: [] },
  { type: "education", title: "里昂商学院 硕士", content: "量化金融方向。", timeRange: { start: "2023-09", end: "2025-06" }, isCurrent: false, tags: [] },
];
const zhMaster = buildMaster({ basicInfo: basic, segments: zhSegs }, "A_master");
ok("中文母版 language = zh（不再硬编码）", zhMaster.language === "zh", zhMaster.language);

console.log("\n③ A/B 主线 buildMaster —— 英文母版");
const enSegs: ParsedSegment[] = [
  { type: "work", title: "Acme Corp — Data Analyst", content: "Built dashboards and delivered business insights with SQL; led cross-functional collaboration.", timeRange: { start: "2023-07", end: "present" }, isCurrent: true, tags: [] },
  { type: "education", title: "EMLYON Business School — MSc", content: "Quantitative Finance track.", timeRange: { start: "2021-09", end: "2023-06" }, isCurrent: false, tags: [] },
];
const enMaster = buildMaster({ basicInfo: basic, segments: enSegs }, "A_master");
ok("英文母版 language = en（按内容检测）", enMaster.language === "en", enMaster.language);

console.log("\n④ C 类 assembleGuidanceMaster —— 英文归集（同走 buildMaster）");
const enBullets: GuidanceBullet[] = [
  { id: "gb_1", topic: "data analysis", text: "Analyzed survey data in Excel and produced a summary report", sourceLevel: "yellow", missingElements: [] },
  { id: "gb_2", topic: "teamwork", text: "Coordinated a campus event across multiple student clubs", sourceLevel: "green", missingElements: [] },
];
const enDrafts: SegmentDraft[] = [
  { id: "d1", type: "internship", title: "Summer Internship — Research Assistant", timeRange: { start: "2024-06", end: "2024-09" }, isCurrent: false, bulletIds: ["gb_1"] },
  { id: "d2", type: "activity", title: "Student Union", timeRange: { start: "2023-09", end: "" }, isCurrent: true, bulletIds: ["gb_2"] },
];
const cEnMaster = assembleGuidanceMaster({ basicInfo: basic, drafts: enDrafts, bullets: enBullets });
ok("C 类英文母版 language = en", cEnMaster.language === "en", cEnMaster.language);

console.log("\n⑤ C 类 assembleGuidanceMaster —— 中文归集（回归不变）");
const zhBullets: GuidanceBullet[] = [
  { id: "gb_1", topic: "数据分析", text: "使用 Excel 整理行业数据并输出报表", sourceLevel: "yellow", missingElements: [] },
];
const zhDrafts: SegmentDraft[] = [
  { id: "d1", type: "internship", title: "国元证券 行研实习", timeRange: { start: "2025-06", end: "2025-09" }, isCurrent: false, bulletIds: ["gb_1"] },
];
const cZhMaster = assembleGuidanceMaster({ basicInfo: basic, drafts: zhDrafts, bullets: zhBullets });
ok("C 类中文母版 language = zh", cZhMaster.language === "zh", cZhMaster.language);

console.log(`\n${failures === 0 ? "✅ 母版语言诚实化验收全过" : `❌ ${failures} 项失败`}`);
process.exit(failures === 0 ? 0 : 1);
