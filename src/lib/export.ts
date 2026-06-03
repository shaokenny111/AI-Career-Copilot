// ============================================================================
// 导出（export）—— 把"完成页采纳后的最终投递内容"转成可复制 / 可下载的产物
// ----------------------------------------------------------------------------
// 【单一数据源铁律】导出消费的 ExportModel 由 CompletePage 从其已渲染的"采纳后
// bullet 列表"（走 scoring 的 isBulletAdopted，与评分同源）派生，本模块只做格式化，
// 不自起任何取数逻辑——导出内容必须与完成页屏幕上看到的最终投递内容逐字一致。
//
// 导出的是【干净简历文本】：纯 rewrittenText / userEditedText，不含 🟢🟡🔴 标注符号
// （那是工作态的来源标识，不进投递版）。
//
// 7B-1：纯文本，零第三方依赖——逐段复制 / 复制全文。
// 7B-2：追加 .docx 下载（docx@9.x）。PDF 留 7B-3。
// ============================================================================

import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";

/** 一段的导出内容（标题 + 副标题/地点 + 时间线 + 采纳后的 bullet 纯文本）。
 *  铁律：Segment 上所有"该出现在简历里"的字段都必须带回这里——
 *  公司/职位在 title，地点/角色在 subtitle，起止时间在 timeRange（含 isCurrent→"至今"）。
 *  content 不进（已被采纳后的改写 bullet 取代）；tags/id/时间戳是内部字段，不展示。 */
export interface ExportSegment {
  title: string;
  typeLabel: string;
  /** 副标题：地点 / 项目角色等（对应 Segment.subtitle）。无则空。 */
  subtitle?: string;
  /** 起止时间显示串（如 "2023-07 ~ 至今"；无明确时间为空串）。
   *  一份没时间线的简历是废的，绝不可丢。 */
  timeRange: string;
  bullets: string[];
}

/** 段落元信息行：副标题/地点 · 时间线（各自存在才拼，避免出现孤立的 "·"）。
 *  三档导出与屏幕共用，保证同源同序。 */
export function segmentMetaLine(seg: ExportSegment): string {
  return [seg.subtitle, seg.timeRange].filter(Boolean).join(" · ");
}

/** 整份投递版的导出模型（CompletePage 从 includedSegments 派生，单一数据源） */
export interface ExportModel {
  /** 顶部上下文标签（公司 · 职位），与完成页屏幕一致 */
  jdLabel: string;
  segments: ExportSegment[];
}

/** 单段 → 纯文本（标题 + 副标题/地点·时间线 + 每条 bullet 一行，无标注符号） */
export function segmentToPlainText(seg: ExportSegment): string {
  const meta = segmentMetaLine(seg);
  const head = meta ? [seg.title, meta] : [seg.title];
  return [...head, ...seg.bullets.map((b) => `- ${b}`)].join("\n");
}

/** 整份 → 纯文本（顶部标签 + 各段，段间空行） */
export function modelToPlainText(model: ExportModel): string {
  return [model.jdLabel, "", ...model.segments.map(segmentToPlainText)]
    .join("\n\n")
    .trim();
}

/** 复制到剪贴板（localhost / https 下 navigator.clipboard 可用；失败抛错由调用方提示） */
export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // 兜底：老环境用临时 textarea + execCommand
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand("copy");
  document.body.removeChild(ta);
  if (!ok) throw new Error("复制失败");
}

// ---------- 7B-2：Word (.docx) ----------
// docx@9.x（已核实当前版本 API）：Document({sections:[{children}]}) + Paragraph
// （heading / bullet:{level} / children:[TextRun]）+ Packer。中文走 UTF-8，已在
// OOXML 小样验证不乱码。

/** 纯函数：ExportModel → docx Document（Node 可测，浏览器下载共用，单一构建逻辑）。
 *  内容与"最终投递内容"逐字一致：标题(H1)=jdLabel，每段(H2)=title，bullet 列表。 */
export function buildDocxDocument(model: ExportModel): Document {
  const children: Paragraph[] = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: model.jdLabel || "投递版本" })],
    }),
  ];
  for (const seg of model.segments) {
    const meta = segmentMetaLine(seg);
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 240, after: meta ? 20 : 60 },
        children: [new TextRun({ text: seg.title })],
      }),
    );
    if (meta) {
      children.push(
        new Paragraph({
          spacing: { after: 60 },
          children: [new TextRun({ text: meta, italics: true, color: "64748B", size: 18 })],
        }),
      );
    }
    for (const b of seg.bullets) {
      children.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: b })] }));
    }
  }
  return new Document({ sections: [{ children }] });
}

/** 浏览器下载 .docx（构建逻辑复用 buildDocxDocument）。 */
export async function downloadDocx(model: ExportModel, filename: string): Promise<void> {
  const blob = await Packer.toBlob(buildDocxDocument(model));
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.toLowerCase().endsWith(".docx") ? filename : `${filename}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------- 7B-3：PDF（浏览器原生 print-to-pdf）----------
// 路线 (b)：不嵌字体，走系统中文字体 → 天然中文、零体积。内容仍复用 ExportModel
// （与屏幕 / Word 逐字同源）。buildPrintHtml 为纯函数（Node 可测：无头浏览器
// --print-to-pdf 验中文），printPdf 用隐藏 iframe 触发系统打印（用户选"另存为 PDF"）。

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** 纯函数：ExportModel → 自包含打印 HTML（系统中文字体 + 打印 CSS）。
 *  结构与"最终投递内容"逐字一致：H1=jdLabel，每段 H2=title，bullet 列表。 */
export function buildPrintHtml(model: ExportModel, title?: string): string {
  const docTitle = escapeHtml(title || model.jdLabel || "投递版本");
  const segs = model.segments
    .map((seg) => {
      const lis = seg.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("");
      const meta = segmentMetaLine(seg);
      const metaHtml = meta ? `<div class="time">${escapeHtml(meta)}</div>` : "";
      return `<section><h2>${escapeHtml(seg.title)}</h2>${metaHtml}<ul>${lis}</ul></section>`;
    })
    .join("");
  return `<!DOCTYPE html>
<html lang="zh"><head><meta charset="utf-8"><title>${docTitle}</title>
<style>
  @page { margin: 18mm; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #1e293b;
    font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei",
      "Noto Sans CJK SC", "Heiti SC", "WenQuanYi Micro Hei", sans-serif;
    font-size: 12pt; line-height: 1.65; }
  h1 { font-size: 18pt; font-weight: 600; margin: 0 0 4pt; }
  .sub { color: #64748b; font-size: 10pt; margin: 0 0 18pt; }
  h2 { font-size: 13pt; font-weight: 600; margin: 16pt 0 2pt; padding-bottom: 3pt;
    border-bottom: 1px solid #e2e8f0; }
  .time { color: #64748b; font-size: 10pt; margin: 3pt 0 4pt; }
  ul { margin: 4pt 0 0; padding-left: 18pt; }
  li { margin: 0 0 5pt; }
  section { page-break-inside: avoid; }
</style></head>
<body>
  <h1>${escapeHtml(model.jdLabel || "投递版本")}</h1>
  <div class="sub">采纳后的最终投递内容</div>
  ${segs}
</body></html>`;
}

/** 浏览器：用隐藏 iframe 写入打印 HTML 并触发系统打印（用户在对话框选"另存为 PDF"）。 */
export function printPdf(model: ExportModel, title?: string): void {
  const html = buildPrintHtml(model, title);
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow?.document;
  if (!doc) {
    iframe.remove();
    throw new Error("无法创建打印视图");
  }
  doc.open();
  doc.write(html);
  doc.close();
  const win = iframe.contentWindow!;
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    setTimeout(() => iframe.remove(), 300);
  };
  win.onafterprint = cleanup;
  // 等 iframe 内容布局完成再打印
  setTimeout(() => {
    win.focus();
    win.print();
    cleanup();
  }, 300);
}
