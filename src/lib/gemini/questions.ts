// ============================================================================
// Prompt #5 应届生 JD 驱动提问
// ----------------------------------------------------------------------------
// 文档第 8 章。针对应届生（C 类用户）+ 目标 JD，生成具体、带例子、降门槛的引导
// 问题，帮他们想起自己其实有的经历。
//
// 输入输出严格用 types.ts 的 GuidanceQuestionsInput / GuidanceQuestionsOutput。
// few-shot example 固定内联（提供问题风格参考）。
// ============================================================================

import { z } from "zod";
import type {
  GuidanceQuestionsInput,
  GuidanceQuestionsOutput,
} from "../../types";
import { runJsonTask } from "./client";
import { formatJobDescription } from "./format";

// ---------- System Prompt（文档 8.4 全文）----------

const SYSTEM_PROMPT = `你是一名专门帮助应届生挖掘自身经历的求职顾问。

【背景】
应届生的核心痛点不是"没有经历"，是"不觉得自己的经历值得写"。
你的任务是用"具体的、带例子的、低门槛的"问题，帮他们想起自己其实有的经历。

【提问设计原则】

1. JD 驱动，不要通用模板
- 错误："你有数据分析经验吗？"（应届生想不起来）
- 正确："你帮老板做过报表吗？社团统计过经费吗？课程作业处理过数据吗？"
（具体到他经历过的场景）

2. 每个问题必须有 4-5 个具体例子
- 应届生最怕开放性问题
- 例子覆盖：课程项目 / 实习 / 竞赛 / 社团 / 兼职 / 志愿者
- 例子要贴近大学生的真实生活

3. 用"做过 X 吗"代替"你的 X 经验"
- 错误："你的团队协作经验？"
- 正确："你参加过需要分工协作的事吗？比如：小组课程项目、社团活动、学生会工作"

4. 跳过友好
- 所有问题都 skip_allowed = true
- 应届生可能确实没做过，硬问会产生挫败感

【根据 JD 选取问题主题】

1. 解析 JD 的核心能力要求
2. 从中选 5-8 个应届生可能有相关经历的能力点
3. 跳过应届生几乎不可能有的能力（如"管理过 50 人团队"）
4. 优先选可迁移性强的能力（数据分析、团队协作、沟通、学习能力、自驱力）

【例子设计的具体场景库】

可以从这些场景中选例子：
- 课程项目（专业课作业、毕业设计、跨学科项目）
- 学生组织（学生会、社团、班委）
- 竞赛（数学建模、商业案例、编程、辩论、创业）
- 实习（任何长度的实习经历）
- 兼职（家教、销售、运营等）
- 志愿者（社会实践、支教）
- 个人项目（独立做的小项目、博客、开源贡献）
- 课外学习（在线课程、读书会）

【输出约束】

- 问题数量 5-8 个，不要超过 8 个（应届生会累）
- 每个问题不超过 50 字
- 每个例子不超过 20 字
- topic 字段用 JD 原词（如果 JD 写"用户研究"，用"用户研究"，不要改成"用户调研"）`;

// ---------- Few-shot Example（文档 8.5，固定内联）----------

const FEW_SHOT_EXAMPLES = `【示例】
输入：JD 是字节跳动产品经理，要求"产品思维、数据分析、用户洞察、跨部门协作"
输出：
{
  "questions": [
    {
      "topic": "数据分析",
      "question": "你做过涉及数据处理或分析的事情吗？",
      "examples": [
        "课程作业用 Excel/SPSS/Python 处理数据",
        "毕设涉及问卷统计分析",
        "实习帮老板做过报表",
        "社团活动统计过参与人数或经费",
        "竞赛中分析过数据"
      ],
      "skip_allowed": true
    },
    {
      "topic": "用户洞察",
      "question": "你深入了解过某群人的需求或想法吗？",
      "examples": [
        "帮家人或朋友选过产品（要了解他们要什么）",
        "课程作业做过用户访谈或问卷",
        "做过家教，了解学生的学习问题",
        "运营社团时观察过成员喜好",
        "做志愿者时了解过服务对象的需求"
      ],
      "skip_allowed": true
    },
    {
      "topic": "跨部门协作",
      "question": "你做过需要和不同人协作的事吗？",
      "examples": [
        "课程小组项目（和不同专业同学合作）",
        "学生会活动（对接学校多个部门）",
        "实习中跨团队沟通",
        "组织过需要多方协调的活动",
        "竞赛中和不同背景的队友配合"
      ],
      "skip_allowed": true
    },
    {
      "topic": "产品思维",
      "question": "你做过涉及思考'用户需要什么'的事吗？",
      "examples": [
        "做过任何小工具或产品（哪怕只是 Excel 模板）",
        "参与过产品体验测试或反馈",
        "在社团或活动中改进过流程",
        "做过运营，思考过受众喜好",
        "写过文章或做过 PPT 给别人看"
      ],
      "skip_allowed": true
    },
    {
      "topic": "快速学习能力",
      "question": "你有快速学会一个新技能或工具的经历吗？",
      "examples": [
        "为了课程项目自学了一个软件",
        "为了实习短期掌握了某工具",
        "上过在线课程并完成了项目",
        "为了竞赛突击学习了新知识",
        "自己学过编程、设计等"
      ],
      "skip_allowed": true
    }
  ]
}`;

// ---------- responseJsonSchema（文档 8.3，snake_case）----------

const RESPONSE_JSON_SCHEMA = {
  type: "object",
  required: ["questions"],
  properties: {
    questions: {
      type: "array",
      minItems: 5,
      maxItems: 8,
      items: {
        type: "object",
        required: ["topic", "question", "examples", "skip_allowed"],
        properties: {
          topic: { type: "string", description: "对应的 JD 能力点（用 JD 原词）" },
          question: { type: "string", description: "具体提问，不超过 50 字" },
          examples: {
            type: "array",
            minItems: 4,
            maxItems: 5,
            items: { type: "string" },
            description: "每个例子不超过 20 字",
          },
          skip_allowed: { type: "boolean" },
        },
      },
    },
  },
} as const;

// ---------- zod 二次校验 ----------

const rawSchema = z.object({
  questions: z.array(
    z.object({
      topic: z.string(),
      question: z.string(),
      examples: z.array(z.string()),
      skip_allowed: z.boolean(),
    }),
  ),
});

// ---------- Prompt 拼装 ----------

function buildPrompt(input: GuidanceQuestionsInput): string {
  return [
    SYSTEM_PROMPT,
    "【参考示例】",
    FEW_SHOT_EXAMPLES,
    "【本次任务输入】",
    "JD 信息：",
    formatJobDescription(input.jobDescription),
    "",
    `用户信息：专业=${input.userInfo.major}；年级=${input.userInfo.grade}`,
    "",
    "请生成 5-8 个 JD 驱动的引导问题，严格按 JSON Schema。",
  ].join("\n");
}

// ---------- 原始输出 → types.ts 契约 ----------

function toContract(raw: z.infer<typeof rawSchema>): GuidanceQuestionsOutput {
  return {
    questions: raw.questions.map((q) => ({
      topic: q.topic,
      question: q.question,
      examples: q.examples,
      skipAllowed: q.skip_allowed,
    })),
  };
}

/** Prompt #5：针对应届生 + JD 生成带例子的引导问题 */
export async function generateGuidanceQuestions(
  input: GuidanceQuestionsInput,
): Promise<GuidanceQuestionsOutput> {
  const raw = await runJsonTask({
    prompt: buildPrompt(input),
    responseJsonSchema: RESPONSE_JSON_SCHEMA as unknown as Record<string, unknown>,
    schema: rawSchema,
  });
  return toContract(raw);
}
