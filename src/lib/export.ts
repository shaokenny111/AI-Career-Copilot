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

import { AlignmentType, BorderStyle, Document, Packer, Paragraph, TabStopType, TextRun } from "docx";
import type { Segment, SegmentType } from "../types";
import { detectContentLang } from "./lang";

// detectContentLang 现归零依赖的 ./lang（摄入/编译层也复用，避免耦合 docx）；
// 此处再导出，保持既有 import { detectContentLang } from "../lib/export" 不破。
export { detectContentLang };

/** 段落起止时间 → 显示串（在职段：中文显示"至今"，英文显示"Present"）。无明确时间返回空串。
 *  铁律：每段经历必须带回时间线，绝不可在完成页/导出丢失。 */
export function formatSegTime(seg: Segment, lang: "zh" | "en"): string {
  const { start, end } = seg.timeRange;
  const endLabel = seg.isCurrent ? (lang === "en" ? "Present" : "至今") : end;
  if (start && endLabel) return `${start} ~ ${endLabel}`;
  return start || endLabel || "";
}

/** 一段的导出内容（标题 + 副标题/地点 + 时间线 + 采纳后的 bullet 纯文本）。
 *  铁律：Segment 上所有"该出现在简历里"的字段都必须带回这里——
 *  公司/职位在 title，地点/角色在 subtitle，起止时间在 timeRange（含 isCurrent→"至今"）。
 *  content 不进（已被采纳后的改写 bullet 取代）；tags/id/时间戳是内部字段，不展示。 */
export interface ExportSegment {
  title: string;
  /** 段落原始类型——用于模板按惯例分区（教育/工作/项目/技能…），不写死模块名。 */
  type: SegmentType;
  typeLabel: string;
  /** 副标题：地点 / 项目角色等（对应 Segment.subtitle）。无则空。 */
  subtitle?: string;
  /** 起止时间显示串（如 "2023-07 ~ 至今"；无明确时间为空串）。
   *  一份没时间线的简历是废的，绝不可丢。 */
  timeRange: string;
  bullets: string[];
}

/** 导出顶部「个人信息抬头区」数据（CompletePage 从 master.basicInfo 派生）。
 *  铁律：这些字段母版里现成存着，导出模板顶部据此渲染姓名/联系方式/头像。
 *  avatar 仅中文模板用（右上角证件照）；英文模板不放照片。 */
export interface ExportBasics {
  name: string;
  phone?: string;
  email?: string;
  location?: string;
  headline?: string;
  links?: Array<{ label: string; url: string }>;
  /** 头像 base64 / URL，可选；仅中文模板渲染。 */
  avatar?: string;
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
  /** 个人信息抬头（姓名/电话/邮箱/链接/简介/头像）。省略则模板不渲染抬头区。 */
  basics?: ExportBasics;
  segments: ExportSegment[];
  /** 投递内容语言（由 CompletePage 按真实内容检测得出）。省略按 "zh" 处理。
   *  用途：PDF 的 <html lang>、固定文案（副标题/兜底标题）跟随语言，
   *  避免英文简历的导出里混入中文 token。注：母版/子版的 language 字段当前在
   *  摄入层恒为 "zh"（未做真检测），不可信，故导出按内容语言判定。 */
  lang?: "zh" | "en";
}

// ---------- 模板：分区归并 + 加粗小标题 + 联系方式（PDF/Word/纯文本共用）----------
// 铁律：不写死模块名。按 seg.type 把段落归到简历惯例分区（区内每段仍用自己的
// title），适配任何人的简历——有几段渲染几段，空区自动丢弃。

interface SectionDef {
  types: SegmentType[];
  zh: string;
  /** 英文模板标题（全大写，对齐英文原件 EDUCATION / PROFESSIONAL EXPERIENCE）。 */
  en: string;
  /** 中文模板括注（首字母大写，对齐中文原件「教育背景 (Education)」）。 */
  enZh: string;
  /** 事实清单区（技能/证书）：走紧凑「列表式」排版，不为每段单独起标题行。 */
  fact?: boolean;
}

/** 分区顺序与命名（教育 → 工作/实习 → 项目 → 技能/证书 → 其他）。
 *  中文模板用「中文 (English)」双语标题（括注首字母大写）；英文模板用大写英文。 */
const SECTION_DEFS: SectionDef[] = [
  { types: ["education"], zh: "教育背景", en: "EDUCATION", enZh: "Education" },
  { types: ["work", "internship"], zh: "工作经验", en: "PROFESSIONAL EXPERIENCE", enZh: "Work Experience" },
  { types: ["project"], zh: "项目经验", en: "PROJECT EXPERIENCE", enZh: "Project Experience" },
  { types: ["skill", "certificate"], zh: "技能与证书", en: "SKILLS & CERTIFICATIONS", enZh: "Skills & Certifications", fact: true },
  { types: ["award", "activity", "other"], zh: "其他", en: "ADDITIONAL", enZh: "Additional" },
];

export interface ExportSection {
  title: string;
  fact: boolean;
  segments: ExportSegment[];
}

/** 把 model.segments 归并到有序分区：区内保持原顺序，空区丢弃。
 *  枚举已被 SECTION_DEFS 全覆盖，理论上无漏网；仍兜底未登记 type 进末尾。 */
export function groupSegments(model: ExportModel): ExportSection[] {
  const en = model.lang === "en";
  const out: ExportSection[] = [];
  const used = new Set<ExportSegment>();
  for (const def of SECTION_DEFS) {
    const segs = model.segments.filter((s) => def.types.includes(s.type));
    if (segs.length === 0) continue;
    segs.forEach((s) => used.add(s));
    out.push({ title: en ? def.en : `${def.zh} (${def.enZh})`, fact: !!def.fact, segments: segs });
  }
  const rest = model.segments.filter((s) => !used.has(s));
  if (rest.length) out.push({ title: en ? "ADDITIONAL" : "其他 (Additional)", fact: false, segments: rest });
  return out;
}

/** bullet「加粗小标题：描述」拆分（reference 两份都用这种领起句式）。
 *  仅当冒号前是 ≤40 字、不含句号的短标签且冒号后有正文时才拆；否则整条为正文。 */
export function splitLeadLabel(bullet: string): { label: string; rest: string } {
  const m = bullet.match(/^([^：:。.]{1,40})[：:]\s*(\S[\s\S]*)$/);
  if (m) return { label: m[1].trim(), rest: m[2].trim() };
  return { label: "", rest: bullet };
}

/** 个人信息联系方式行（电话 · 邮箱 · 城市 · 链接），按存在与否拼，避免孤立分隔符。 */
export function contactParts(basics: ExportBasics): string[] {
  return [
    basics.phone ?? "",
    basics.email ?? "",
    basics.location ?? "",
    ...(basics.links ?? []).map((l) => l.url),
  ].filter(Boolean);
}

/** 粗略估算导出 PDF 页数——只为完成页的"温和提示"服务，绝不据此自动删/缩内容。
 *  按内容行数 ÷ 每页行数估。参数已校准到当前高保真模板：
 *    · 中文 9pt + 边距 10mm/13.5mm → 每行约 56 字、每页约 60 行；
 *    · 英文 11pt + 边距 5mm/12.7mm → 每行约 95 字符、每页约 56 行。
 *  （旧参数按宽松模板估，每行仅 36 字、每页 46 行，会把半页内容虚估成 2 页。） */
function estimateLines(model: ExportModel): { lines: number; perPage: number } {
  const en = model.lang === "en";
  const perLine = en ? 95 : 56; // 每行约容纳字符数
  const perPage = en ? 56 : 60; // 每页约容纳行数
  const bulletLines = (t: string) => Math.max(1, Math.ceil(t.length / perLine)) + 0.2;
  let lines = model.basics ? 3 : 1; // 抬头区（居中：姓名/简介/联系方式）
  for (const sec of groupSegments(model)) {
    lines += 1.8; // 区标题 + 间距
    for (const seg of sec.segments) {
      if (!sec.fact) lines += 1.4; // 机构标题行
      for (const b of seg.bullets) lines += bulletLines(b);
    }
  }
  return { lines, perPage };
}

export function estimatePageCount(model: ExportModel): number {
  const { lines, perPage } = estimateLines(model);
  return Math.max(1, Math.ceil(lines / perPage));
}

/** 估算首页填充比例（内容行数 ÷ 单页行数；>1 表示超过一页）。
 *  供完成页判定"导出偏空"——填得太少给温和提示，绝不据此自动加内容。 */
export function estimatePageFill(model: ExportModel): number {
  const { lines, perPage } = estimateLines(model);
  return lines / perPage;
}

/** 单段 → 纯文本（标题 + 副标题/地点·时间线 + 每条 bullet 一行，无标注符号） */
export function segmentToPlainText(seg: ExportSegment): string {
  const meta = segmentMetaLine(seg);
  const head = meta ? [seg.title, meta] : [seg.title];
  return [...head, ...seg.bullets.map((b) => `- ${b}`)].join("\n");
}

/** 整份 → 纯文本（个人信息抬头 + 目标岗位标签 + 各段，段间空行）。
 *  抬头来自 basics（姓名/简介/联系方式），与 PDF/Word 同源；干净无标注。 */
export function modelToPlainText(model: ExportModel): string {
  const head: string[] = [];
  if (model.basics) {
    if (model.basics.name) head.push(model.basics.name);
    if (model.basics.headline) head.push(model.basics.headline);
    const contact = contactParts(model.basics);
    if (contact.length) head.push(contact.join(" · "));
  }
  return [...head, model.jdLabel, "", ...model.segments.map(segmentToPlainText)]
    .filter((s, i, arr) => !(s === "" && arr[i - 1] === "")) // 不连续空行
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
 *  与 PDF buildPrintHtml 同一套高保真参数（对齐用户原 docx）：
 *  · 抬头居中（姓名 + 简介 + 联系方式），中英一致、均无照片。
 *  · 字体/字号：中文 微软雅黑 9pt（姓名 18pt）、英文 Times New Roman 11pt（姓名 14pt）。
 *  · 页边距：中文 上下10mm/左右13.5mm、英文 上下5mm/左右12.7mm（原件值）。
 *  · 分区标题加粗带下横线；中文机构行「机构 | 副标题 | 时间」一行加粗、
 *    英文机构行 标题左 + 地点·时间右制表位右对齐；bullet「加粗小标题：描述」。 */
export function buildDocxDocument(model: ExportModel): Document {
  const isEn = model.lang === "en";
  const fallbackTitle = isEn ? "Resume" : "投递版本";
  // 字号（half-point）：中文 9pt=18 / 18pt=36；英文 11pt=22 / 14pt=28 / 12pt=24
  const bodySize = isEn ? 22 : 18;
  const nameSize = isEn ? 28 : 36;
  const headSize = isEn ? 24 : 18; // 分区标题
  const metaSize = isEn ? 24 : 18; // 联系方式
  const orgSize = isEn ? 22 : 18; // 机构行
  const RIGHT_TAB = 10466; // 内容右界（A4 11906 − 左右各 720）— 英文机构行右对齐位
  const sectionBorder = { bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000", space: 2 } };
  const children: Paragraph[] = [];
  const b = model.basics;

  // 抬头：居中，姓名 / 简介 / 联系方式（无照片，中英一致）
  if (b?.name) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 20 },
        children: [new TextRun({ text: b.name, bold: true, size: nameSize })],
      }),
    );
  }
  if (b?.headline) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 20 },
        children: [new TextRun({ text: b.headline, size: metaSize })],
      }),
    );
  }
  const contact = b ? contactParts(b) : [];
  if (contact.length) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
        children: [new TextRun({ text: contact.join(isEn ? "   |   " : "   ·   "), size: metaSize })],
      }),
    );
  }

  // 分区（不写死模块名）
  for (const sec of groupSegments(model)) {
    children.push(
      new Paragraph({
        spacing: { before: 140, after: 40 },
        border: sectionBorder,
        children: [new TextRun({ text: sec.title, bold: true, size: headSize })],
      }),
    );
    for (const seg of sec.segments) {
      if (!sec.fact) {
        if (isEn) {
          const meta = segmentMetaLine(seg);
          children.push(
            new Paragraph({
              spacing: { before: 40, after: 10 },
              ...(meta ? { tabStops: [{ type: TabStopType.RIGHT, position: RIGHT_TAB }] } : {}),
              children: meta
                ? [
                    new TextRun({ text: seg.title, bold: true, size: orgSize }),
                    new TextRun({ text: `\t${meta}`, size: orgSize }),
                  ]
                : [new TextRun({ text: seg.title, bold: true, size: orgSize })],
            }),
          );
        } else {
          // 中文：机构 | 副标题 | 时间 一行加粗
          const head = [seg.title, seg.subtitle, seg.timeRange].filter(Boolean).join("   |   ");
          children.push(
            new Paragraph({
              spacing: { before: 40, after: 10 },
              children: [new TextRun({ text: head, bold: true, size: orgSize })],
            }),
          );
        }
      }
      for (const bul of seg.bullets) {
        const { label, rest } = splitLeadLabel(bul);
        const sep = isEn ? ": " : "：";
        children.push(
          new Paragraph({
            bullet: { level: 0 },
            spacing: { after: 10 },
            children: label
              ? [
                  new TextRun({ text: label + sep, bold: true, size: bodySize }),
                  new TextRun({ text: rest, size: bodySize }),
                ]
              : [new TextRun({ text: bul, size: bodySize })],
          }),
        );
      }
    }
  }

  if (children.length === 0) {
    children.push(new Paragraph({ children: [new TextRun({ text: fallbackTitle, size: bodySize })] }));
  }

  return new Document({
    styles: {
      default: {
        document: {
          run: {
            font: isEn
              ? { ascii: "Times New Roman", hAnsi: "Times New Roman", cs: "Times New Roman" }
              : { ascii: "微软雅黑", eastAsia: "微软雅黑", hAnsi: "微软雅黑" },
            size: bodySize,
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: isEn
              ? { top: 284, right: 720, bottom: 284, left: 720 }
              : { top: 567, right: 765, bottom: 567, left: 765 },
          },
        },
        children,
      },
    ],
  });
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

/** 纯函数：ExportModel → 自包含打印 HTML（黑白简历模板，系统字体；PDF 主路径）。
 *  · 全黑白；中英均无照片（抬头居中，对齐用户原 docx）。
 *  · 顶部个人信息抬头（姓名 / 简介 / 联系方式，居中）+ 按 type 分区（不写死模块名）。
 *  · 中文机构行「机构 | 副标题 | 时间」一行加粗；英文机构标题左、地点·时间右对齐；
 *    bullet「加粗小标题：描述」领起。
 *  · 字体/字号：中文 微软雅黑 9pt、英文 Times New Roman 11pt（对齐用户原 docx）。
 *  · 分页：每段（标题+其 bullet）整体不跨页，区标题不在页底孤儿。 */
export function buildPrintHtml(model: ExportModel, title?: string): string {
  const isEn = model.lang === "en";
  const fallbackTitle = isEn ? "Resume" : "投递版本";
  const b = model.basics;
  const docTitle = escapeHtml(title || b?.name || model.jdLabel || fallbackTitle);

  // 个人信息抬头区（中英一致：整体居中、无照片，贴合英文原件）
  const nameHtml = b?.name ? `<div class="name">${escapeHtml(b.name)}</div>` : "";
  const headlineHtml = b?.headline ? `<div class="headline">${escapeHtml(b.headline)}</div>` : "";
  const contactSep = isEn ? '<span class="dot">|</span>' : '<span class="dot">·</span>';
  const contactHtml = b
    ? (() => {
        const parts = contactParts(b).map(escapeHtml);
        return parts.length ? `<div class="contact">${parts.join(contactSep)}</div>` : "";
      })()
    : "";
  const header =
    nameHtml || contactHtml
      ? `<header class="hdr">${nameHtml}${headlineHtml}${contactHtml}</header>`
      : "";

  // 分区渲染：区内每段保留自己的 title；技能/证书区走列表式
  const sectionsHtml = groupSegments(model)
    .map((sec) => {
      const entries = sec.segments
        .map((seg) => {
          const lis = seg.bullets
            .map((bul) => {
              const { label, rest } = splitLeadLabel(bul);
              const sep = isEn ? ": " : "：";
              return label
                ? `<li><b>${escapeHtml(label)}${sep}</b>${escapeHtml(rest)}</li>`
                : `<li>${escapeHtml(bul)}</li>`;
            })
            .join("");
          if (sec.fact) {
            return `<div class="entry fact">${lis ? `<ul>${lis}</ul>` : ""}</div>`;
          }
          if (isEn) {
            // 英文：机构标题左、地点·时间右对齐（贴合原件机构行右对齐惯例）
            const meta = escapeHtml(segmentMetaLine(seg));
            return `<div class="entry"><div class="ehead"><span class="etitle">${escapeHtml(seg.title)}</span>${
              meta ? `<span class="emeta">${meta}</span>` : ""
            }</div>${lis ? `<ul>${lis}</ul>` : ""}</div>`;
          }
          // 中文：机构 | 副标题 | 时间 一行加粗（贴合原件"学校 | 学位 | 时间"）
          const head = [seg.title, seg.subtitle, seg.timeRange]
            .filter(Boolean)
            .map((x) => escapeHtml(x as string))
            .join("&nbsp;&nbsp;|&nbsp;&nbsp;");
          return `<div class="entry"><div class="ehead">${head}</div>${lis ? `<ul>${lis}</ul>` : ""}</div>`;
        })
        .join("");
      return `<section><h2>${escapeHtml(sec.title)}</h2>${entries}</section>`;
    })
    .join("");

  // 字体：中文母版用微软雅黑（姓名原为华文细黑=Mac 字体，Win 缺失退化微软雅黑）；
  //       英文用 Times New Roman——均为原件实际用字。
  const cjk = `"Microsoft YaHei", "微软雅黑", "PingFang SC", "Noto Sans CJK SC", sans-serif`;
  const latin = `"Times New Roman", Times, "PingFang SC", serif`;

  // 中文模板：边距 10mm/13.5mm、正文 9pt、姓名 18pt、抬头居中（同英文，无照片）、
  //           分区标题 9pt 加粗带横线（对齐原件参数）
  const cssZh = `
  @page { margin: 10mm 13.5mm; }
  * { box-sizing: border-box; }
  body { margin:0; color:#000; font-family:${cjk}; font-size:9pt; line-height:1.4; }
  .hdr { text-align:center; margin-bottom:4pt; break-after:avoid; }
  .name { font-size:18pt; font-weight:700; line-height:1.1; }
  .headline { font-size:9pt; margin-top:2pt; }
  .contact { font-size:9pt; margin-top:3pt; word-break:break-word; }
  .contact .dot { margin:0 5pt; }
  h2 { font-size:9pt; font-weight:700; margin:9pt 0 3pt; padding-bottom:2pt;
    border-bottom:1pt solid #000; break-after:avoid; }
  .entry { break-inside:avoid; page-break-inside:avoid; margin-bottom:3pt; }
  .ehead { font-weight:700; font-size:9pt; margin-top:4pt; }
  ul { margin:2pt 0 0; padding-left:15pt; }
  li { margin:0 0 1.5pt; }
  .entry.fact ul { margin:0; }`;

  // 英文模板：边距 5mm/12.7mm、正文 11pt、姓名 14pt 居中、分区标题 12pt 加粗带横线
  const cssEn = `
  @page { margin: 5mm 12.7mm; }
  * { box-sizing: border-box; }
  body { margin:0; color:#000; font-family:${latin}; font-size:11pt; line-height:1.3; }
  .hdr { text-align:center; margin-bottom:3pt; break-after:avoid; }
  .name { font-size:14pt; font-weight:700; }
  .headline { font-size:12pt; margin-top:1pt; }
  .contact { font-size:12pt; margin-top:1pt; word-break:break-word; }
  .contact .dot { margin:0 4pt; }
  h2 { font-size:12pt; font-weight:700; margin:7pt 0 2pt; padding-bottom:1pt;
    border-bottom:1pt solid #000; break-after:avoid; }
  .entry { break-inside:avoid; page-break-inside:avoid; margin-bottom:3pt; }
  .ehead { display:flex; justify-content:space-between; align-items:baseline; gap:12pt; }
  .etitle { font-weight:700; font-size:11pt; }
  .emeta { font-size:11pt; white-space:nowrap; flex-shrink:0; }
  ul { margin:1pt 0 0; padding-left:16pt; }
  li { margin:0 0 1.5pt; }
  .entry.fact ul { margin:0; }`;

  return `<!DOCTYPE html>
<html lang="${isEn ? "en" : "zh"}"><head><meta charset="utf-8"><title>${docTitle}</title>
<style>${isEn ? cssEn : cssZh}</style></head>
<body>
  ${header}
  ${sectionsHtml}
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
