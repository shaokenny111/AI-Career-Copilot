// ============================================================================
// Prompt #4 简历类型识别
// ----------------------------------------------------------------------------
// 文档第 7 章。识别用户上传的简历是 A 类（完整母版）/ B 类（已精简投递版）/
// C 类（半成品/应届生），决定后续产品流程分支。
//
// 输入只传统计特征（不传完整简历），输入输出严格用 types.ts 的
// ResumeTypeInput / ResumeTypeOutput。few-shot example 固定内联。
// ============================================================================

import { z } from "zod";
import type { ResumeTypeInput, ResumeTypeOutput } from "../../types";
import { runJsonTask } from "./client";

// ---------- System Prompt（文档 7.4 全文）----------

const SYSTEM_PROMPT = `你是一名简历状态识别专家。

【你的核心任务】
判断用户上传的简历处于哪种状态，决定后续产品流程分支。

【三类状态的特征】

A_master（完整母版）：
- 字数：1500+ 字
- segments 数量：6+（含教育、工作、项目、技能等）
- bullets 详细度：每个工作经历 4+ 个 bullet
- 时间跨度：覆盖完整职业生涯，无明显断档
- 表现：内容丰富、可能略显冗长、覆盖面广

B_compiled（已精简的投递版）：
- 字数：500-1500 字（明显压在 1 页）
- segments 数量：4-6（精选）
- bullets 详细度：每个工作经历 2-3 个 bullet（明显精简）
- 表现：信息密度高、看起来已经针对某个方向优化过
- 关键信号：早期经历缺失、技能列表精简

C_incomplete（半成品/应届生）：
- 字数：<500 字
- segments 数量：<4
- 大量必要字段缺失（如：只有教育，没有项目；只有姓名，没有联系方式）
- 表现：明显是"还没写完"或"第一次写"

【处理流程】

1. 先看绝对指标：字数、segments 数量
2. 再看相对指标：bullets 详细度、时间断档
3. 综合判断 confidence

【后续动作映射】

A_master → direct_to_jd_input（直接进入 JD 输入）
B_compiled → suggest_supplement_master（提示用户补充被删的经历）
C_incomplete → enter_reverse_guidance（进入应届生反向引导流程）

【核心原则】

- 信号要在 signals 字段中具体列出（如"工作经历仅 3 条 bullet，明显精简过"）
- confidence 用 medium 不丢人，宁可保守不要乱判
- 不要因为"看起来内容少"就一律判 C——可能是简洁风格的 A 类

【输出约束】

- signals 至少 2 条，最多 5 条
- 每条 signals 不超过 30 字
- follow_up_action 必须给出`;

// ---------- Few-shot Example（文档 7.5，固定内联）----------

const FEW_SHOT_EXAMPLES = `【示例】
输入：
word_count: 900
segment_count: 5
segments_summary:
- 工作经历，bullet_count: 3，has_time_range: true
- 工作经历，bullet_count: 2，has_time_range: true
- 教育背景，bullet_count: 1，has_time_range: true
- 技能，bullet_count: 5，has_time_range: false
- 项目，bullet_count: 2，has_time_range: true
has_basic_info: true
text_sample: "[简历前 500 字...]"
输出：
{
  "resume_type": "B_compiled",
  "confidence": "high",
  "signals": [
    "总字数 900，明显压在 1 页",
    "仅 5 段经历，时间跨度有跳跃",
    "工作经历 bullet 数 2-3 条，明显精简过",
    "技能列表只有 5 项，过于精简"
  ],
  "follow_up_action": "suggest_supplement_master"
}`;

// ---------- responseJsonSchema（文档 7.3，snake_case）----------

const RESPONSE_JSON_SCHEMA = {
  type: "object",
  required: ["resume_type", "confidence", "signals", "follow_up_action"],
  properties: {
    resume_type: {
      type: "string",
      enum: ["A_master", "B_compiled", "C_incomplete"],
    },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    signals: { type: "array", items: { type: "string" } },
    follow_up_action: {
      type: "string",
      enum: [
        "direct_to_jd_input",
        "suggest_supplement_master",
        "enter_reverse_guidance",
      ],
    },
  },
} as const;

// ---------- zod 二次校验 ----------

const rawSchema = z.object({
  resume_type: z.enum(["A_master", "B_compiled", "C_incomplete"]),
  confidence: z.enum(["high", "medium", "low"]),
  signals: z.array(z.string()),
  follow_up_action: z.enum([
    "direct_to_jd_input",
    "suggest_supplement_master",
    "enter_reverse_guidance",
  ]),
});

// ---------- 输入序列化 ----------

function formatInput(input: ResumeTypeInput): string {
  const summary = input.segmentsSummary
    .map(
      (s) =>
        `- ${s.type}，bullet_count: ${s.bulletCount}，has_time_range: ${s.hasTimeRange}`,
    )
    .join("\n");
  return [
    `word_count: ${input.wordCount}`,
    `segment_count: ${input.segmentCount}`,
    "segments_summary:",
    summary,
    `has_basic_info: ${input.hasBasicInfo}`,
    `text_sample: "${input.textSample}"`,
  ].join("\n");
}

function buildPrompt(input: ResumeTypeInput): string {
  return [
    SYSTEM_PROMPT,
    "【参考示例】",
    FEW_SHOT_EXAMPLES,
    "【本次任务输入】",
    formatInput(input),
    "",
    "请严格按 JSON Schema 输出。",
  ].join("\n");
}

// ---------- 原始输出 → types.ts 契约（字段名一致，仅转 camelCase）----------

function toContract(raw: z.infer<typeof rawSchema>): ResumeTypeOutput {
  return {
    resumeType: raw.resume_type,
    confidence: raw.confidence,
    signals: raw.signals,
    followUpAction: raw.follow_up_action,
  };
}

/** Prompt #4：根据简历统计特征识别 A/B/C 类型 */
export async function classifyResumeType(
  input: ResumeTypeInput,
): Promise<ResumeTypeOutput> {
  const raw = await runJsonTask({
    prompt: buildPrompt(input),
    responseJsonSchema: RESPONSE_JSON_SCHEMA as unknown as Record<string, unknown>,
    schema: rawSchema,
  });
  return toContract(raw);
}
