// ============================================================================
// Prompt #6 STAR 格式转换
// ----------------------------------------------------------------------------
// 文档第 9 章。把应届生口语化的回答（来自 #5 的提问）在不编造的前提下转换成
// STAR 格式的简历 bullet，并标注信息来源等级。核心红线：提升表达，不提升经历。
//
// 输入输出严格用 types.ts 的 StarConversionInput / StarConversionOutput。
// few-shot examples 固定内联（STAR 转换高度依赖 examples）。
// ============================================================================

import { z } from "zod";
import type {
  StarConversionInput,
  StarConversionOutput,
} from "../../types";
import { runJsonTask } from "./client";

// ---------- System Prompt（文档 9.4 全文）----------

const SYSTEM_PROMPT = `你是一名 STAR 格式转换专家，专门把口语化的应届生描述转换为专业的简历 bullet。

【背景】
应届生通常会用大白话描述自己的经历，缺乏专业表达。
你的任务是在不编造的前提下，把他们的回答转换为 STAR 格式的 bullet。

【STAR 框架】

S (Situation)：情境 / 背景
T (Task)：任务 / 目标
A (Action)：具体行动
R (Result)：结果 / 成果

【转换规则】

1. 不编造事实
- 用户没说的数字，不要凭空造
- 例：用户说"做了一个 Excel 表" → 不要写"主导 60+ 学生×4 学期数据分析"
- 例：用户说"统计了 60 个人" → 可以写"完成 60 人规模数据统计"

2. 模糊量化用"X+"
- 用户说"挺多人参加的" → 写"X+ 名参与者"（标注为 yellow，提示用户填实际数字）

3. 提取动作动词
- 把用户的动词升级为专业动词
- "做" → "完成 / 执行 / 主导"（根据用户角色）
- "帮" → "协助 / 支持"
- "想出" → "提出 / 设计"

4. 保留事实，提升表达
- 错误转换：用户"做了报表" → "主导构建数据分析中枢"
- 正确转换：用户"做了报表" → "完成 Excel 数据报表的搭建与日常维护"

【信息来源等级】

green：完全基于用户原话
yellow：合理推断或模糊量化
red：原话完全没有但 STAR 要求必须有（比如用户没说结果）

【缺失元素处理】

如果用户回答缺少 STAR 中的某个要素：
- missing_elements 字段中列出
- 前端会提示用户补充
- 即使缺失，也要给出当前能写出的最好版本

【输出约束】

- star_bullet 不超过 60 字
- extracted_elements 中每项不超过 25 字
- 如果某个元素用户没说，对应字段写"未明确"`;

// ---------- Few-shot Examples（文档 9.5，固定内联）----------

const FEW_SHOT_EXAMPLES = `【示例 1：合理量化标 yellow】
输入：
user_answer: "大三时帮辅导员统计了班级两年的奖学金数据，用 Excel 算了平均分和及格率，做了个表给辅导员。"
related_jd_requirement: "数据分析能力"
topic: "数据分析"
输出：
{
  "star_bullet": "协助辅导员完成班级 2 学年奖学金数据分析，运用 Excel 统计 X+ 学生的平均分与及格率，输出可视化报表支持决策",
  "source_level": "yellow",
  "extracted_elements": {
    "situation": "大三期间，辅导员需要班级奖学金数据汇总",
    "task": "完成 2 学年奖学金数据的统计与分析",
    "action": "使用 Excel 计算平均分、及格率等关键指标",
    "result": "输出报表供辅导员决策参考"
  },
  "missing_elements": ["具体学生人数"]
}

【示例 2：克制，不要拔高应届生经历（核心红线）】
输入：
user_answer: 我在便利店做过收银，有时候客人多就帮忙理货。
related_jd_requirement: 运营管理能力
topic: 运营管理
❌ 错误（严重拔高）：star_bullet="主导门店运营管理，统筹收银与库存调度，显著提升门店运营效率"，source_level=green
✅ 正确输出：
{
  "star_bullet": "在便利店兼职期间负责收银结算，高峰时段协助商品理货，保障门店正常运转",
  "source_level": "green",
  "extracted_elements": {
    "situation": "便利店兼职",
    "task": "完成收银结算工作",
    "action": "高峰时段协助理货",
    "result": "未明确"
  },
  "missing_elements": ["可量化的工作成果（如日均处理订单数）"]
}
说明：STAR 转换是"提升表达"，不是"提升经历"。用户做收银和理货，就如实写，只升级表达不升级角色。result 用户没说就标"未明确"并列进 missing_elements，不要编造成果。`;

// ---------- responseJsonSchema（文档 9.3，snake_case）----------

const RESPONSE_JSON_SCHEMA = {
  type: "object",
  required: ["star_bullet", "source_level", "extracted_elements"],
  properties: {
    star_bullet: {
      type: "string",
      description: "STAR 格式的最终 bullet，不超过 60 字",
    },
    source_level: { type: "string", enum: ["green", "yellow", "red"] },
    extracted_elements: {
      type: "object",
      required: ["situation", "task", "action", "result"],
      properties: {
        situation: { type: "string" },
        task: { type: "string" },
        action: { type: "string" },
        result: { type: "string" },
      },
    },
    missing_elements: {
      type: "array",
      items: { type: "string" },
      description: "用户没说清楚的 STAR 元素，前端可提示补充",
    },
  },
} as const;

// ---------- zod 二次校验 ----------

const rawSchema = z.object({
  star_bullet: z.string(),
  source_level: z.enum(["green", "yellow", "red"]),
  extracted_elements: z.object({
    situation: z.string(),
    task: z.string(),
    action: z.string(),
    result: z.string(),
  }),
  missing_elements: z.array(z.string()).optional().default([]),
});

// ---------- Prompt 拼装 ----------

function buildPrompt(input: StarConversionInput): string {
  return [
    SYSTEM_PROMPT,
    "【参考示例】",
    FEW_SHOT_EXAMPLES,
    "【本次任务输入】",
    `user_answer: ${input.userAnswer}`,
    `related_jd_requirement: ${input.relatedJdRequirement}`,
    `topic: ${input.topic}`,
    "",
    "请转换为 STAR 格式 bullet，严格按 JSON Schema。",
  ].join("\n");
}

// ---------- 原始输出 → types.ts 契约 ----------

function toContract(raw: z.infer<typeof rawSchema>): StarConversionOutput {
  return {
    starBullet: raw.star_bullet,
    sourceLevel: raw.source_level,
    extractedElements: {
      situation: raw.extracted_elements.situation,
      task: raw.extracted_elements.task,
      action: raw.extracted_elements.action,
      result: raw.extracted_elements.result,
    },
    missingElements: raw.missing_elements,
  };
}

/** Prompt #6：把口语化回答转成 STAR 格式 bullet + 信息来源标注 */
export async function convertToStar(
  input: StarConversionInput,
): Promise<StarConversionOutput> {
  const raw = await runJsonTask({
    prompt: buildPrompt(input),
    responseJsonSchema: RESPONSE_JSON_SCHEMA as unknown as Record<string, unknown>,
    schema: rawSchema,
  });
  return toContract(raw);
}
