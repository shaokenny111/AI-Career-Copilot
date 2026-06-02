// ============================================================================
// 7B 验收：复制文本 + Word(.docx) —— 纯前端、不打 Gemini
// ----------------------------------------------------------------------------
// 复用 lib/export.ts 的真实构建逻辑（buildDocxDocument / *PlainText），不另起逻辑。
// 验：① 复制文本干净（无 🟢🟡🔴、逐字含 bullet）；② docx 中文不乱码 + 结构完整。
// 跑法：npx tsx scripts/verify-export.ts
// ============================================================================

import { writeFileSync, mkdtempSync } from "node:fs";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Packer } from "docx";
import {
  buildDocxDocument,
  modelToPlainText,
  segmentToPlainText,
  type ExportModel,
} from "../src/lib/export";

const model: ExportModel = {
  jdLabel: "字节跳动 · AI 产品经理",
  segments: [
    {
      title: "海晟佛山金融租赁有限公司 项目经理助理",
      typeLabel: "工作经历",
      bullets: [
        "跨部门协作打通业务、风控、财务数据口径，将项目周期缩短约 20%",
        "熟练使用 SQL 进行业务数据查询与分析",
      ],
    },
    {
      title: "AI 简历编译器(AI Resume Compiler)",
      typeLabel: "项目经历",
      bullets: ["设计 9 个分工明确的 Prompt 任务链，落地母版-子版编译"],
    },
  ],
};

const MARKERS = ["🟢", "🟡", "🔴"];
let pass = true;
const ok = (b: boolean, msg: string) => {
  console.log(`  ${b ? "✅" : "❌"} ${msg}`);
  if (!b) pass = false;
};

console.log("① 复制文本（7B-1）");
const full = modelToPlainText(model);
const segText = segmentToPlainText(model.segments[0]);
ok(!MARKERS.some((m) => full.includes(m)), "复制全文不含 🟢🟡🔴 标注符号");
ok(full.includes("跨部门协作打通业务、风控、财务数据口径，将项目周期缩短约 20%"), "全文逐字含 bullet 文本");
ok(full.includes("字节跳动 · AI 产品经理"), "全文含 jdLabel");
ok(segText.startsWith("海晟佛山金融租赁有限公司 项目经理助理"), "单段复制首行=段标题");
ok(segText.includes("- 熟练使用 SQL 进行业务数据查询与分析"), "单段复制含 bullet（- 前缀，无标注）");

console.log("\n② Word .docx（7B-2）");
const buf = await Packer.toBuffer(buildDocxDocument(model));
const dir = mkdtempSync(join(tmpdir(), "vexport-"));
const f = join(dir, "out.docx");
writeFileSync(f, buf);
console.log(`  生成 ${f}（${buf.length} 字节）`);
const xml = execSync(`unzip -p "${f}" word/document.xml`, { encoding: "utf8" });
ok(xml.includes("跨部门协作打通业务、风控、财务数据口径"), "document.xml 中文 bullet 不乱码（UTF-8）");
ok(xml.includes("字节跳动 · AI 产品经理"), "含 H1 标题文本 jdLabel");
ok(xml.includes("海晟佛山金融租赁有限公司 项目经理助理") && xml.includes("AI 简历编译器(AI Resume Compiler)"), "含两段 H2 段标题");
ok(xml.includes("熟练使用 SQL 进行业务数据查询与分析"), "含含英文混排 bullet（SQL）");
ok(xml.includes("<w:numPr>"), "bullet 走列表项（numPr）结构完整");
ok(!MARKERS.some((m) => xml.includes(m)), "docx 正文不含 🟢🟡🔴 标注符号");

console.log(`\n${pass ? "✅ 7B 验收通过" : "❌ 验收失败"}`);
process.exit(pass ? 0 : 1);
