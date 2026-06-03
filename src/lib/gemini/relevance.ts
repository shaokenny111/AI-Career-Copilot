// ============================================================================
// Prompt #2 内容相关性评估
// ----------------------------------------------------------------------------
// 文档第 5 章。针对完整母版，评估每段经历对当前 JD 的相关性，输出 🟢🟡🔴 三色
// 取舍建议（high/medium/low + suggested_action）。
//
// 输入必须含 timeRange + isCurrent（由 format.ts 强制带上）。输入输出严格用
// types.ts 的 RelevanceInput / RelevanceOutput。few-shot examples 固定内联。
// ============================================================================

import { z } from "zod";
import type { RelevanceInput, RelevanceOutput } from "../../types";
import { runJsonTask } from "./client";
import { formatJobDescription, formatSegments } from "./format";

// ---------- System Prompt（文档 5.4 全文）----------

const SYSTEM_PROMPT = `你是一名简历策略顾问，专精于"针对岗位的内容取舍"。

【你的核心任务】
评估用户简历中每段经历对当前 JD 的相关性，给出取舍建议，但最终决策权留给用户。

【相关度判定标准】

🟢 high（强相关）：
- 经历的核心能力直接对应 JD 的要求
- 例：JD 要"数据分析"，用户有"国元证券数据分析实习" → high

🟡 medium（弱相关）：
- 经历的部分能力可以对应 JD，但不是核心匹配
- 例：JD 要"产品经理"，用户有"金融分析师经验" → medium（分析能力可迁移）

🔴 low（不相关）：
- 经历与 JD 的能力要求几乎无关联
- 例：JD 要"AI PM"，用户有"大学辩论队经历" → low

【建议动作判定】

keep_and_optimize（保留并改写）：
- 仅对 high 段落
- 这些是简历的主战场，需要重点优化

keep_simplified（保留但精简）：
- 仅对 medium 段落
- 保留但只留最相关的 1-2 个 bullet

hide_in_this_version（本次投递隐藏）：
- 仅对 low 段落
- 提示：隐藏不是删除，母版永远保留

【核心原则】

1. 诚实评估，不讨好用户
- 如果一段经历真的不相关，标 low，不要因为"用户花了时间做的"就标 medium

2. 考虑可迁移性
- low 不等于"没用"
- 如果某段经历有可迁移的能力（如领导力、抗压能力），在 transferable_value 字段说明

3. 保护母版意识
- reason 中明确说"本次投递不相关"，而不是"这段经历不重要"
- 用户需要知道母版永远保留所有经历

4. 谨慎处理教育经历
- 教育经历通常都是 high（除非完全不相关的专业 + 工作经验已经很丰富）
- 不要轻易建议隐藏教育经历

【输出约束】

- reason 不超过 40 字
- 必须给出 suggested_action
- low 类必须填 transferable_value（如果完全没有可迁移价值，写"本次投递可隐藏"）`;

// ---------- Few-shot Examples（文档 5.5，固定内联）----------

const FEW_SHOT_EXAMPLES = `【示例 1：常规取舍】
输入：用户母版含 5 段经历，投递"字节跳动 AI 产品经理"
输出：
{
  "evaluations": [
    {
      "segment_id": "seg_1",
      "relevance": "high",
      "reason": "AI Resume Copilot 项目直接展示 AI 产品落地能力",
      "suggested_action": "keep_and_optimize",
      "transferable_value": ""
    },
    {
      "segment_id": "seg_3",
      "relevance": "medium",
      "reason": "金融租赁 PM 经验可迁移，但行业差异大",
      "suggested_action": "keep_simplified",
      "transferable_value": "保留 PM 工作方法和跨部门协作的可迁移价值"
    },
    {
      "segment_id": "seg_4",
      "relevance": "low",
      "reason": "HSBC 证券服务与 AI 产品岗位无直接关联",
      "suggested_action": "hide_in_this_version",
      "transferable_value": "本次投递可隐藏，可迁移性弱"
    }
  ]
}

【示例 2：必须敢标 low（对抗讨好倾向）】
输入：投递"字节跳动 AI 产品经理"；segment_id=seg_x，类型=课外活动，标题=校学生会文艺部 部员，内容=参与组织校园歌手大赛，负责活动现场布置和签到。
❌ 错误（硬抬成 medium）：reason="活动组织体现项目协调能力，可迁移到产品工作"
✅ 正确输出：
{
  "evaluations": [
    {
      "segment_id": "seg_x",
      "relevance": "low",
      "reason": "活动现场执行与 AI 产品岗位核心能力无直接关联，本次投递不相关",
      "suggested_action": "hide_in_this_version",
      "transferable_value": "本次投递可隐藏；如需体现，仅保留'组织协调'一项软能力"
    }
  ]
}
说明：真不相关就标 low，不要因为"用户花了时间"而抬高。low 只代表"本次投递不相关"，母版永远保留。

【示例 3：教育经历不要轻易标 low（对抗误判）】
输入：segment_id=seg_edu，类型=教育背景，标题=EMLYON 量化金融硕士 2023-2025，内容=量化金融与市场金融方向。JD=字节跳动 AI 产品经理（强调技术理解、数据能力）
✅ 正确输出：
{
  "evaluations": [
    {
      "segment_id": "seg_edu",
      "relevance": "high",
      "reason": "量化背景体现数据敏感度与逻辑分析能力，是 AI PM 的加分项",
      "suggested_action": "keep_and_optimize",
      "transferable_value": ""
    }
  ]
}
说明：教育经历通常标 high，除非专业完全不相关且工作经验已极丰富。`;

// ---------- responseJsonSchema（文档 5.3，snake_case）----------

const RESPONSE_JSON_SCHEMA = {
  type: "object",
  required: ["evaluations"],
  properties: {
    evaluations: {
      type: "array",
      items: {
        type: "object",
        required: ["segment_id", "relevance", "reason", "suggested_action"],
        properties: {
          segment_id: { type: "string" },
          relevance: { type: "string", enum: ["high", "medium", "low"] },
          reason: { type: "string", description: "为什么是这个相关度，不超过 40 字" },
          suggested_action: {
            type: "string",
            enum: ["keep_and_optimize", "keep_simplified", "hide_in_this_version"],
          },
          transferable_value: {
            type: "string",
            description: "如果是低相关，说明可迁移的价值（如果有）",
          },
        },
      },
    },
  },
} as const;

// ---------- zod 二次校验 ----------

const rawSchema = z.object({
  evaluations: z.array(
    z.object({
      segment_id: z.string(),
      relevance: z.enum(["high", "medium", "low"]),
      reason: z.string(),
      suggested_action: z.enum([
        "keep_and_optimize",
        "keep_simplified",
        "hide_in_this_version",
      ]),
      transferable_value: z.string().optional(),
    }),
  ),
});

// ---------- Prompt 拼装 ----------

function buildPrompt(input: RelevanceInput): string {
  return [
    SYSTEM_PROMPT,
    "【参考示例】",
    FEW_SHOT_EXAMPLES,
    "【本次任务输入】",
    "母版所有段落：",
    formatSegments(input.segments),
    "",
    "JD 信息（公司名与相关性无关，已略去以保证可复现）：",
    formatJobDescription({ ...input.jobDescription, company: "" }),
    "",
    "请逐段评估相关性，严格按 JSON Schema 输出 evaluations。",
  ].join("\n");
}

// ---------- 原始输出 → types.ts 契约 ----------

function toContract(raw: z.infer<typeof rawSchema>): RelevanceOutput {
  return {
    evaluations: raw.evaluations.map((e) => ({
      segmentId: e.segment_id,
      relevance: e.relevance,
      reason: e.reason,
      suggestedAction: e.suggested_action,
      transferableValue: e.transferable_value,
    })),
  };
}

/** Prompt #2：评估母版每段经历对 JD 的相关性，输出取舍建议 */
export async function evaluateRelevance(
  input: RelevanceInput,
): Promise<RelevanceOutput> {
  const raw = await runJsonTask({
    prompt: buildPrompt(input),
    responseJsonSchema: RESPONSE_JSON_SCHEMA as unknown as Record<string, unknown>,
    schema: rawSchema,
    temperature: 0, // 相关性决定 finalIncluded（评分输入），必须可复现
  });
  return toContract(raw);
}
