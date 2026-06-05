// ============================================================================
// 7B 验收：复制文本 + Word(.docx) —— 纯前端、不打 Gemini
// ----------------------------------------------------------------------------
// 复用 lib/export.ts 的真实构建逻辑（buildDocxDocument / *PlainText），不另起逻辑。
// 验：① 复制文本干净（无 🟢🟡🔴、逐字含 bullet）；② docx 中文不乱码 + 结构完整。
// 跑法：npx tsx scripts/verify-export.ts
// ============================================================================

import { writeFileSync, mkdtempSync, readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Packer } from "docx";
import { PDFParse } from "pdf-parse";
import {
  buildDocxDocument,
  buildPrintHtml,
  detectContentLang,
  formatSegTime,
  modelToPlainText,
  segmentToPlainText,
  type ExportModel,
} from "../src/lib/export";
import type { Segment } from "../src/types";

const model: ExportModel = {
  jdLabel: "字节跳动 · AI 产品经理",
  segments: [
    {
      title: "海晟佛山金融租赁有限公司 项目经理助理",
      typeLabel: "工作经历",
      subtitle: "广东 · 佛山",
      timeRange: "2023-07 ~ 至今",
      bullets: [
        "跨部门协作打通业务、风控、财务数据口径，将项目周期缩短约 20%",
        "熟练使用 SQL 进行业务数据查询与分析",
      ],
    },
    {
      title: "AI 简历编译器(AI Resume Compiler)",
      typeLabel: "项目经历",
      subtitle: "独立开发者",
      timeRange: "2025-08 ~ 2026-03",
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
// 回归（P0）：简历展示字段绝不可丢——复制文本每段都带 地点(subtitle) + timeRange
ok(segText.includes("2023-07 ~ 至今"), "单段复制含起止时间（timeRange 不丢）");
ok(full.includes("2023-07 ~ 至今") && full.includes("2025-08 ~ 2026-03"), "复制全文含每段起止时间（timeRange 不丢）");
ok(segText.includes("广东 · 佛山"), "单段复制含地点/副标题（subtitle 不丢）");
ok(full.includes("广东 · 佛山") && full.includes("独立开发者"), "复制全文含每段地点/副标题（subtitle 不丢）");

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
ok(xml.includes("2023-07 ~ 至今") && xml.includes("2025-08 ~ 2026-03"), "docx 每段含起止时间（timeRange 不丢）");
ok(xml.includes("广东 · 佛山") && xml.includes("独立开发者"), "docx 每段含地点/副标题（subtitle 不丢）");
ok(xml.includes("<w:numPr>"), "bullet 走列表项（numPr）结构完整");
ok(!MARKERS.some((m) => xml.includes(m)), "docx 正文不含 🟢🟡🔴 标注符号");

console.log("\n③ PDF（7B-3，无头浏览器 print-to-pdf + 抽字验中文字形）");
const BROWSERS = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
];
const browser = BROWSERS.find((p) => existsSync(p));
if (!browser) {
  ok(false, "未找到无头 Edge/Chrome —— 无法真出 PDF 验中文，停下报告");
} else {
  const htmlPath = join(dir, "sample.html");
  const pdfPath = join(dir, "sample.pdf");
  writeFileSync(htmlPath, buildPrintHtml(model), "utf8");
  const fileUrl = "file:///" + htmlPath.replace(/\\/g, "/");
  execSync(
    `"${browser}" --headless --disable-gpu --no-pdf-header-footer --print-to-pdf="${pdfPath}" "${fileUrl}"`,
    { stdio: "ignore" },
  );
  ok(existsSync(pdfPath), `无头浏览器生成 PDF（${browser.includes("Edge") ? "Edge" : "Chrome"}）`);
  const parser = new PDFParse({ data: readFileSync(pdfPath) });
  const { text } = await parser.getText();
  await parser.destroy();
  ok(text.includes("跨部门协作打通业务"), "PDF 抽出中文 bullet 字形（非方块/缺字）");
  ok(text.includes("字节跳动") && text.includes("AI 产品经理"), "PDF 含 jdLabel 中文");
  ok(text.includes("SQL"), "PDF 中英混排（SQL）正常");
  ok(text.includes("海晟佛山金融租赁有限公司") && text.includes("AI 简历编译器"), "PDF 含各段标题（结构）");
  ok(text.includes("2023-07") && text.includes("2025-08"), "PDF 每段含起止时间（timeRange 不丢）");
  ok(text.includes("佛山") && text.includes("独立开发者"), "PDF 每段含地点/副标题（subtitle 不丢）");
  ok(!MARKERS.some((m) => text.includes(m)), "PDF 正文不含 🟢🟡🔴 标注符号");
}

console.log("\n④ 诚实差距（7C）：substantiveGaps 只上屏、不入导出");
// 代表性实质差距（形如 gap.ts/#3 产出）；故意用与简历正文无关的独特字串
const gaps = [
  { jdRequirement: "5 年以上团队管理经验", interviewStrategy: "弱化团队规模，强调跨部门影响力与项目主导经验" },
  { jdRequirement: "电商 / 大模型应用场景经验", interviewStrategy: "面试前体验电商 AI 竞品，准备一份竞品分析作敲门砖" },
];
const gapTexts = gaps.flatMap((g) => [g.jdRequirement, g.interviewStrategy]);
const printHtml = buildPrintHtml(model);
const leaks = (s: string) => gapTexts.filter((t) => s.includes(t));
ok(gaps.length > 0, `fixture 含 substantiveGaps ${gaps.length} 条（完成页可渲染）`);
ok(leaks(full).length === 0, "复制全文不含任何差距文本");
ok(leaks(printHtml).length === 0, "PDF 打印 HTML 不含任何差距文本");
ok(leaks(xml).length === 0, "Word document.xml 不含任何差距文本");
console.log("  （exportModel 仅由 includedSegments 派生、从不读 gapAnalysis → 差距天然不入导出）");

console.log("\n⑤ 英文简历语言渗漏修复（确定性中文 token 不进英文导出）");
// 语言判据：内容检测（language 字段在摄入层恒为 zh、不可信，导出按真实内容判）
ok(detectContentLang("Built dashboards and delivered business insights with SQL") === "en", "英文内容 → 检测为 en");
ok(detectContentLang("跨部门协作打通业务、风控、财务数据口径") === "zh", "中文内容 → 检测为 zh");
ok(detectContentLang("熟练使用 SQL 进行业务数据查询与分析") === "zh", "中英混排（中文为主）→ zh");

// 在职段时间串：中文"至今" / 英文"Present"（覆盖验收线"三档不再出现'至今'"）
const segBase = {
  id: "seg_x", type: "work" as const, title: "t", content: "c",
  tags: [], createdAt: "", updatedAt: "",
};
const curSeg: Segment = { ...segBase, timeRange: { start: "2023-07", end: "present" }, isCurrent: true };
const pastSeg: Segment = { ...segBase, timeRange: { start: "2024-01", end: "2025-03" }, isCurrent: false };
ok(formatSegTime(curSeg, "en") === "2023-07 ~ Present", "在职段 en → '2023-07 ~ Present'（无'至今'）");
ok(formatSegTime(curSeg, "zh") === "2023-07 ~ 至今", "在职段 zh → '2023-07 ~ 至今'（中文路径不受影响）");
ok(formatSegTime(pastSeg, "en") === "2024-01 ~ 2025-03", "已结束段 en → 原起止（不受语言影响）");

// 英文导出模型：PDF/Word 固定文案 + lang 跟随英文，绝无中文 token
const enModel: ExportModel = {
  lang: "en",
  jdLabel: "Acme Corp · Data Analyst",
  segments: [
    {
      title: "Acme Corp — Data Analyst",
      typeLabel: "Work",
      subtitle: "Shanghai",
      timeRange: formatSegTime(curSeg, "en"),
      bullets: ["Built dashboards and delivered business insights with SQL"],
    },
  ],
};
const enHtml = buildPrintHtml(enModel);
const enFull = modelToPlainText(enModel);
ok(enHtml.includes('lang="en"'), "PDF HTML 的 <html lang> = en");
ok(enHtml.includes("Final Resume Content"), "PDF 副标题英文化（Final Resume Content）");
ok(!enHtml.includes("采纳后的最终投递内容"), "PDF 不含中文副标题 token");
ok(!enHtml.includes("至今"), "PDF（HTML）不含'至今'");
ok(!enFull.includes("至今"), "复制全文（英文）不含'至今'");
// 英文 docx 实际解包验无中文 token
const enBuf = await Packer.toBuffer(buildDocxDocument(enModel));
const enDocxPath = join(dir, "out-en.docx");
writeFileSync(enDocxPath, enBuf);
const enDocXml = execSync(`unzip -p "${enDocxPath}" word/document.xml`, { encoding: "utf8" });
ok(!enDocXml.includes("至今"), "Word（英文）不含'至今'");
ok(enDocXml.includes("Present"), "Word（英文）在职段显示 Present");

// 回归：中文路径固定文案不变
const zhHtml = buildPrintHtml(model);
ok(zhHtml.includes('lang="zh"'), "中文 PDF 的 <html lang> 仍为 zh");
ok(zhHtml.includes("采纳后的最终投递内容"), "中文 PDF 副标题不变");

console.log(`\n${pass ? "✅ 7B/7C 验收通过" : "❌ 验收失败"}`);
process.exit(pass ? 0 : 1);
