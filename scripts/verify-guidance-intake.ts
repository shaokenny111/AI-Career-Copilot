// ============================================================================
// Phase 4 第一步结构验收（不烧配额）
// ----------------------------------------------------------------------------
// 证明：假 bullet + 用户填的归集草稿 → assembleGuidanceMaster → 合法 Master。
// 验收点：
//  ① 组装出的 Master 走的是 buildMaster 同一路径（含 id / 时间戳 / resumeType）
//  ② 每段都带【非空】timeRange.start + isCurrent（铁律：防 AI 脑补年限）
//  ③ isCurrent=true 的段 end 归一为 "present"
//  ④ content 由归到该段的 bullet 文本拼成；tags 为该段 bullet 的 topic 去重
//  ⑤ validateDrafts 能挡住缺 title / 缺时间 / 无 bullet 的非法草稿
// 跑法：npx tsx scripts/verify-guidance-intake.ts
// ============================================================================

import {
  assembleGuidanceMaster,
  validateDrafts,
  type GuidanceBullet,
  type SegmentDraft,
} from "../src/lib/guidanceIntake";

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  const tag = cond ? "✅" : "❌";
  console.log(`${tag} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}

// ---- 假数据：模拟问答攒下的 3 条 bullet ----
const bullets: GuidanceBullet[] = [
  { id: "gb_1", topic: "数据分析", text: "使用 Excel 整理行业数据并输出报表", sourceLevel: "yellow", missingElements: ["数据规模"] },
  { id: "gb_2", topic: "数据分析", text: "对季度数据做透视分析支撑决策", sourceLevel: "green", missingElements: [] },
  { id: "gb_3", topic: "跨部门协作", text: "联合多个社团统筹一次校园活动", sourceLevel: "yellow", missingElements: ["参与人数"] },
];

// ---- 用户归集出的两段经历（时间/标题/在职态由用户填）----
const drafts: SegmentDraft[] = [
  {
    id: "d1", type: "internship", title: "国元证券 行研实习",
    timeRange: { start: "2025-06", end: "2025-09" }, isCurrent: false,
    bulletIds: ["gb_1", "gb_2"],
  },
  {
    id: "d2", type: "activity", title: "校学生会",
    timeRange: { start: "2024-09", end: "" }, isCurrent: true,
    bulletIds: ["gb_3"],
  },
];

// ---- ① 组装 ----
const master = assembleGuidanceMaster({
  basicInfo: { name: "张三", email: "z@x.com", phone: "13800000000" },
  drafts,
  bullets,
});

check("Master 含 id / resumeType=C_incomplete",
  !!master.id && master.resumeType === "C_incomplete", master.resumeType);
check("段数 = 草稿数", master.segments.length === drafts.length, `${master.segments.length}`);
check("每段有 buildMaster 赋的 id 与时间戳",
  master.segments.every((s) => !!s.id && !!s.createdAt && !!s.updatedAt));

// ---- ② 铁律：timeRange.start + isCurrent 非空 ----
check("每段 timeRange.start 非空（防脑补年限）",
  master.segments.every((s) => s.timeRange.start.trim().length > 0));
check("每段 isCurrent 为布尔",
  master.segments.every((s) => typeof s.isCurrent === "boolean"));

// ---- ③ isCurrent=true → end="present" ----
const cur = master.segments.find((s) => s.isCurrent);
check("在职段 end 归一为 present", !!cur && cur.timeRange.end === "present", cur?.timeRange.end);
const past = master.segments.find((s) => !s.isCurrent);
check("非在职段保留用户填的 end", !!past && past.timeRange.end === "2025-09", past?.timeRange.end);

// ---- ④ content 拼接 + tags 去重 ----
const seg1 = master.segments[0];
check("content 由 bullet 文本拼成",
  seg1.content.includes("整理行业数据") && seg1.content.includes("透视分析"));
check("tags 为 topic 去重", seg1.tags.length === 1 && seg1.tags[0] === "数据分析", seg1.tags.join(","));

// ---- ⑤ validateDrafts 拦非法 ----
const bad: SegmentDraft[] = [
  { id: "bad1", type: "project", title: "", timeRange: { start: "", end: "" }, isCurrent: false, bulletIds: [] },
  { id: "bad2", type: "project", title: "有标题", timeRange: { start: "2025-01", end: "" }, isCurrent: false, bulletIds: ["gb_1"] },
];
const errs = validateDrafts(bad);
const e1 = errs.find((e) => e.draftId === "bad1");
check("缺 title/时间/bullet 的草稿被全数标出",
  !!e1 && e1.missing.includes("标题") && e1.missing.includes("起始时间") && e1.missing.includes("结束时间") && e1.missing.includes("至少 1 条经历内容"),
  e1?.missing.join("/"));
check("非在职但缺 end 被标出",
  errs.some((e) => e.draftId === "bad2" && e.missing.includes("结束时间")));
check("合法草稿不报错", validateDrafts(drafts).length === 0);

console.log(failures === 0 ? "\n🎉 结构验收全过" : `\n💥 ${failures} 项失败`);
process.exit(failures === 0 ? 0 : 1);
