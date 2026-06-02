// ============================================================================
// 7D 验收：投递标记（纯前端、零 Gemini）—— storage + 响应式 + 持久
// ----------------------------------------------------------------------------
// 用内存 localStorage shim 跑真实 storage 逻辑：标记/取消、订阅通知、快照引用、
// 跨"刷新"持久（重新 loadStorage 读回）。跑法：npx tsx scripts/verify-application-mark.ts
// ============================================================================

// 1) 先装最小 localStorage + window shim（storage.isBrowser 检 window.localStorage）
const mem = new Map<string, string>();
(globalThis as any).window = {
  localStorage: {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k),
  },
};

const {
  addCompiledVersion,
  setApplicationMark,
  loadStorage,
  getStorageSnapshot,
  subscribeStorage,
  resetStorage,
} = await import("../src/lib/storage");
type CV = import("../src/types").CompiledVersion;

let pass = true;
const ok = (b: boolean, msg: string) => {
  console.log(`  ${b ? "✅" : "❌"} ${msg}`);
  if (!b) pass = false;
};

resetStorage();
const v = {
  id: "ver_x",
  masterId: "m",
  name: "字节跳动-AI产品经理-20260603",
  language: "zh",
  createdAt: "t",
  updatedAt: "t",
  jobDescription: { company: "字节跳动", position: "AI 产品经理", rawText: "" },
  segmentDecisions: [],
  requirementMatches: [],
  gapAnalysis: { expressionGaps: [], substantiveGaps: [], overallJudgment: "improve_first", overallScore: 80 },
  applicationMark: { applied: false },
} as unknown as CV;
addCompiledVersion(v);

const markOf = () => loadStorage().compiledVersions.find((x) => x.id === "ver_x")!.applicationMark;

console.log("① 初始 = 未投递");
ok(markOf().applied === false, "applied=false");
ok(markOf().appliedAt === undefined, "无 appliedAt");

console.log("\n② 响应式：订阅 + 快照引用");
let notified = 0;
const unsub = subscribeStorage(() => notified++);
const snapBefore = getStorageSnapshot();

console.log("\n③ 标记为已投递（记录日期）");
setApplicationMark("ver_x", true);
const m1 = markOf();
ok(m1.applied === true, "applied=true");
ok(typeof m1.appliedAt === "string" && !Number.isNaN(Date.parse(m1.appliedAt!)), `appliedAt 为合法日期（${m1.appliedAt}）`);
ok(notified >= 1, "订阅者被通知（实时反映）");
ok(getStorageSnapshot() !== snapBefore, "快照引用已变化（触发 useSyncExternalStore 重渲染）");
ok(getStorageSnapshot().compiledVersions[0].applicationMark.applied === true, "快照内容=已投递");

console.log("\n④ 取消标记 → 恢复未投递");
setApplicationMark("ver_x", false);
ok(markOf().applied === false, "applied=false");
ok(markOf().appliedAt === undefined, "appliedAt 已清空");

console.log("\n⑤ 刷新持久（重新 loadStorage 从 storage 读回）");
setApplicationMark("ver_x", true);
const reloaded = loadStorage().compiledVersions.find((x) => x.id === "ver_x")!;
ok(reloaded.applicationMark.applied === true, "重读后仍为已投递（持久化到 storage）");
ok(loadStorage().schemaVersion === 2, "schemaVersion 仍为 2（未因投递标记触发升级/重置）");

unsub();
console.log(`\n${pass ? "✅ 7D 验收通过" : "❌ 验收失败"}`);
process.exit(pass ? 0 : 1);
