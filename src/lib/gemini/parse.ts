// ============================================================================
// Prompt #7 母版解析（纯文本 → 结构化 segments）
// ----------------------------------------------------------------------------
// 文档 2.4 铁律：传给任何 AI 任务的都必须是结构化、完整、真实的简历数据，
// 所以上传/粘贴得到的纯文本，第一步就要切成 BasicInfo + Segment[]。
//
// 本任务【不在原 6 个 Prompt 之列】，是 Phase 3 上传流程新增的解析 Prompt，
// 仍严格遵守全局规范：System 正文 + few-shot 内联 + responseJsonSchema +
// zod 二次校验。核心红线：
//   - 每段必须带 time_range + is_current（缺失会让 #2/#3 脑补工作年限、误判应届）
//   - content 存原文完整内容，禁止摘要（摘要会让后续改写丢事实）
//   - 只做"切分与归类"，不得编造原文没有的经历
//
// 输入输出严格用 types.ts 的 ResumeParseInput / ResumeParseOutput。
// ============================================================================

import { z } from "zod";
import type {
  BasicInfo,
  ParsedSegment,
  ResumeParseInput,
  ResumeParseOutput,
  SegmentType,
} from "../../types";
import { runJsonTask } from "./client";

// ---------- System Prompt ----------

const SYSTEM_PROMPT = `你是一名简历结构化解析专家。
你的任务是把一段简历纯文本，切分并归类成结构化的 JSON，不做任何美化、改写或编造。

【segment 的类型枚举（type 字段必须取其一）】
work=工作经历；internship=实习经历；project=项目经历；education=教育背景；
skill=技能特长；certificate=证书；award=获奖；activity=课外活动/社团；other=其他

【切分原则】
1. 一段独立经历 = 一个 segment（一份工作、一段实习、一个项目、一所学校各自独立）
2. 同一类零散信息可合并：所有技能合成一个 skill 段，所有证书合成一个 certificate 段
3. title 用经历主体（如"国元证券 行业研究实习生""里昂商学院 硕士"）
4. content 必须保留原文的完整描述（职责、成果、数字、工具都不能丢），禁止压缩成摘要

【时间字段（强制，最重要的红线）】
- time_range.start / time_range.end 用 "YYYY-MM" 格式（如 "2025-08"）
- 原文只给到年份时，月份补 "-01"（如 "2021" → "2021-01"）
- 仍在职 / 进行中：end 填 "present"，且 is_current=true
- 已结束的经历：is_current=false
- 技能、证书等天然没有时间段的：start 和 end 都填空字符串 ""，is_current=false
- 绝不能因为原文没写清楚就编造时间；实在无法判断的经历类段落，start/end 留空但仍要给出字段

【basic_info】
- name / email / phone 必填，原文缺失则填空字符串 ""（绝不编造）
- headline（一句话定位）、location（城市）能提取就填，否则省略

【绝对禁止】
- 编造原文不存在的经历、公司、项目
- 把 content 改写、润色或精简（这一步只做搬运和归类）
- 漏掉 time_range 或 is_current 字段`;

// ---------- Few-shot Example（固定内联）----------

const FEW_SHOT_EXAMPLES = `【示例】
输入（简历纯文本）：
邵子康  shaokenny@example.com  138-0000-0000  上海
AI 产品经理，金融科技背景

工作经历
海晟金融租赁 | 产品经理 | 2022.07 - 2024.12
负责租赁业务线数字化系统建设，主导需求梳理与跨部门协作，推动业务流程线上化。

实习经历
国元证券 | 行业研究实习生 | 2021.06 - 2021.09
参与新能源汽车板块行业研究，撰写行业分析报告。

教育背景
里昂商学院 EMLYON 硕士 量化金融方向 2023.09 - 2025.06

技能
SQL、Python（Pandas/NumPy）、Figma；CFA 一级

输出：
{
  "basic_info": {
    "name": "邵子康",
    "email": "shaokenny@example.com",
    "phone": "138-0000-0000",
    "headline": "AI 产品经理，金融科技背景",
    "location": "上海"
  },
  "segments": [
    {
      "type": "work",
      "title": "海晟金融租赁 产品经理",
      "content": "负责租赁业务线数字化系统建设，主导需求梳理与跨部门协作，推动业务流程线上化。",
      "time_range": { "start": "2022-07", "end": "2024-12" },
      "is_current": false,
      "tags": ["产品经理", "跨部门协作"]
    },
    {
      "type": "internship",
      "title": "国元证券 行业研究实习生",
      "content": "参与新能源汽车板块行业研究，撰写行业分析报告。",
      "time_range": { "start": "2021-06", "end": "2021-09" },
      "is_current": false,
      "tags": ["行业研究"]
    },
    {
      "type": "education",
      "title": "里昂商学院 EMLYON 硕士",
      "subtitle": "量化金融方向",
      "content": "里昂商学院 EMLYON 硕士，量化金融方向。",
      "time_range": { "start": "2023-09", "end": "2025-06" },
      "is_current": false,
      "tags": ["量化金融"]
    },
    {
      "type": "skill",
      "title": "技能与证书",
      "content": "SQL、Python（Pandas/NumPy）、Figma；CFA 一级。",
      "time_range": { "start": "", "end": "" },
      "is_current": false,
      "tags": ["SQL", "Python", "CFA"]
    }
  ]
}`;

// ---------- responseJsonSchema（snake_case）----------

const SEGMENT_TYPES: SegmentType[] = [
  "work",
  "internship",
  "project",
  "education",
  "skill",
  "certificate",
  "award",
  "activity",
  "other",
];

const RESPONSE_JSON_SCHEMA = {
  type: "object",
  required: ["basic_info", "segments"],
  properties: {
    basic_info: {
      type: "object",
      required: ["name", "email", "phone"],
      properties: {
        name: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        headline: { type: "string" },
        location: { type: "string" },
      },
    },
    segments: {
      type: "array",
      items: {
        type: "object",
        required: ["type", "title", "content", "time_range", "is_current", "tags"],
        properties: {
          type: { type: "string", enum: SEGMENT_TYPES },
          title: { type: "string" },
          subtitle: { type: "string" },
          content: { type: "string" },
          time_range: {
            type: "object",
            required: ["start", "end"],
            properties: {
              start: { type: "string" },
              end: { type: "string" },
            },
          },
          is_current: { type: "boolean" },
          tags: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
} as const;

// ---------- zod 二次校验 ----------

const rawSchema = z.object({
  basic_info: z.object({
    name: z.string(),
    email: z.string(),
    phone: z.string(),
    headline: z.string().optional(),
    location: z.string().optional(),
  }),
  segments: z.array(
    z.object({
      type: z.enum([
        "work",
        "internship",
        "project",
        "education",
        "skill",
        "certificate",
        "award",
        "activity",
        "other",
      ]),
      title: z.string(),
      subtitle: z.string().optional(),
      content: z.string(),
      time_range: z.object({ start: z.string(), end: z.string() }),
      is_current: z.boolean(),
      tags: z.array(z.string()),
    }),
  ),
});

// ---------- Prompt 拼装 ----------

function buildPrompt(input: ResumeParseInput): string {
  return [
    SYSTEM_PROMPT,
    "【参考示例】",
    FEW_SHOT_EXAMPLES,
    "【本次任务输入（简历纯文本）】",
    input.rawText,
    "",
    "请严格按 JSON Schema 输出，每段务必带 time_range 与 is_current。",
  ].join("\n");
}

// ---------- 原始输出 → types.ts 契约 ----------

function toContract(raw: z.infer<typeof rawSchema>): ResumeParseOutput {
  const basicInfo: BasicInfo = {
    name: raw.basic_info.name,
    email: raw.basic_info.email,
    phone: raw.basic_info.phone,
    ...(raw.basic_info.headline ? { headline: raw.basic_info.headline } : {}),
    ...(raw.basic_info.location ? { location: raw.basic_info.location } : {}),
  };

  const segments: ParsedSegment[] = raw.segments.map((s) => ({
    type: s.type,
    title: s.title,
    ...(s.subtitle ? { subtitle: s.subtitle } : {}),
    content: s.content,
    timeRange: { start: s.time_range.start, end: s.time_range.end },
    isCurrent: s.is_current,
    tags: s.tags,
  }));

  return { basicInfo, segments };
}

/** Prompt #7：把简历纯文本解析成 BasicInfo + ParsedSegment[]（每段强制带时间字段） */
export async function parseResumeText(
  input: ResumeParseInput,
): Promise<ResumeParseOutput> {
  const raw = await runJsonTask({
    prompt: buildPrompt(input),
    responseJsonSchema: RESPONSE_JSON_SCHEMA as unknown as Record<string, unknown>,
    schema: rawSchema,
  });
  return toContract(raw);
}
