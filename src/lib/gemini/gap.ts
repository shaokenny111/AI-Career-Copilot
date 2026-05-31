// ============================================================================
// Prompt #3 差距分析
// ----------------------------------------------------------------------------
// 文档第 6 章。对比母版与 JD，输出两类差距：表达性差距（改写能补）vs 实质性差距
// （改写补不上），并给整体投递建议。核心红线：不能把硬差距伪装成表达性差距。
//
// 输入必须含 timeRange + isCurrent（format.ts 保证）。输入输出严格用 types.ts 的
// GapAnalysisInput / GapAnalysisOutput。
//
// 【两处文档↔types.ts 的值域差异，在映射层桥接】
//   - severity：文档枚举用 nice_to_have，types.ts 的 GapSeverity 用 minor
//   - overall_judgment：文档枚举用 skip，types.ts 的 OverallJudgment 用 not_recommended
//   发给 AI 的 schema/examples 按文档（不自创），zod 校验文档值域，再映射成 types 值域。
//
// 【overallScore】文档 2.6 明确：匹配度是确定性加权命中率，不由 AI 打分。本任务不
//   产出分数，这里置 0 占位，待后续"匹配度评分模块"用确定性算法回填。
// ============================================================================

import { z } from "zod";
import type {
  GapAnalysisInput,
  GapAnalysisOutput,
  GapSeverity,
  OverallJudgment,
} from "../../types";
import { runJsonTask } from "./client";
import { formatJobDescription, formatSegments } from "./format";

// ---------- System Prompt（文档 6.4 全文）----------

const SYSTEM_PROMPT = `你是一名诚实的求职策略顾问，专精于"识别简历能解决的差距 vs 简历改不掉的差距"。

【你的核心任务】
对比用户母版与 JD，找出两类差距，并给出针对性应对策略。

【两类差距的判定】

表达性差距（expression_gaps）：
- 用户在某段经历中实际具备这个能力，但简历表述没体现
- 简历改写就能解决
- 例：JD 要"团队协作"，用户简历没提，但他在大公司工作过 → 改写可补上

实质性差距（substantive_gaps）：
- 用户简历和经历中都看不到这个能力
- 改写简历无法解决，必须靠学习/项目/经验
- 例：JD 要"5 年管理经验"，用户只有 2 年 → 简历改不掉

【实质性差距的严重程度】

hard_filter（一票否决）：
- JD 中的"必须条件"，如"必须有 5 年经验"、"必须有 PMP"
- 这类差距可能导致直接被筛掉

important（重要但非否决）：
- JD 中的"加分项"，会影响竞争力但不致命

nice_to_have（锦上添花）：
- JD 中提到但不强调

【整体投递建议判定】

recommended（建议投递）：
- 无 hard_filter 差距，或仅 1 个 important 差距
- 表达性差距改写后匹配度可达 80+

improve_first（先改进再投）：
- 表达性差距很多，改写空间大
- 改写后预计能从 60 提升到 80+

skip（建议跳过）：
- 存在 2 个以上 hard_filter 差距
- 或核心硬技能完全缺失

【应对策略的写法】

interview_strategy 字段：
- 不超过 60 字
- 具体可操作（不要写"努力学习"这种空话）
- 例："面试中可用 X 经历类比，展示快速学习能力" / "建议参加 Y 培训补充该能力"

【核心原则】

1. 诚实优先
- 不要把实质性差距说成表达性差距来讨好用户
- AI 的价值是让用户提前知道真相，而不是让用户产生虚假乐观

2. 给出可操作建议
- 每个 substantive_gap 都必须有 interview_strategy
- 不能只说"你缺这个"，必须说"那怎么办"

3. 区分硬性和软性
- hard_filter 必须明确标注，因为这关系到"要不要投"

【输出约束】

- expression_gaps 数量通常 3-7 条（如果用户简历已经很完善，可以 0-2 条）
- substantive_gaps 数量通常 1-5 条
- overall_judgment 必须给出，不能留空`;

// ---------- Few-shot Examples（文档 6.5，固定内联）----------

const FEW_SHOT_EXAMPLES = `【示例 1：金融转 AI PM】
输入：用户母版 + 字节跳动 AI PM JD
输出：
{
  "expression_gaps": [
    {
      "jd_requirement": "数据驱动的产品决策",
      "user_has_evidence": "海晟租赁工作中处理过业务数据分析",
      "where_to_add": "工作经历段落，补充数据分析的具体案例"
    },
    {
      "jd_requirement": "AI 产品落地经验",
      "user_has_evidence": "AI Resume Copilot 项目已具备",
      "where_to_add": "项目经历段落，突出产品决策和上线效果"
    }
  ],
  "substantive_gaps": [
    {
      "jd_requirement": "5 年以上互联网产品经验",
      "severity": "hard_filter",
      "interview_strategy": "强调金融行业的深度业务理解可迁移；用 AI Copilot 项目证明产品落地能力"
    },
    {
      "jd_requirement": "管理过 5 人以上团队",
      "severity": "important",
      "interview_strategy": "弱化团队规模，强调跨部门协作中的影响力发挥"
    }
  ],
  "overall_judgment": "improve_first"
}

【示例 2：不要把实质性差距伪装成表达性差距（核心红线）】
背景：用户是金融转 AI PM，无互联网产品经验。JD 要求"3 年以上互联网产品经验"。
❌ 错误：把"3 年互联网产品经验"塞进 expression_gaps（理由"金融工作中有产品化思维"），substantive_gaps 留空，overall_judgment 给 recommended。
✅ 正确输出：
{
  "expression_gaps": [
    {
      "jd_requirement": "数据驱动的产品决策",
      "user_has_evidence": "金融工作中有数据分析经历",
      "where_to_add": "工作经历段落，补充数据分析案例"
    }
  ],
  "substantive_gaps": [
    {
      "jd_requirement": "3 年以上互联网产品经验",
      "severity": "hard_filter",
      "interview_strategy": "用 AI Copilot 个人项目证明从0到1的产品落地能力，弱化行业差异，强调可迁移的业务理解"
    }
  ],
  "overall_judgment": "improve_first"
}
说明：用户经历里【真的没有】的能力必须进 substantive_gaps，不能进 expression_gaps。只有"用户实际具备、但简历没写出来"的，才是表达性差距。`;

// ---------- responseJsonSchema（文档 6.3，snake_case；severity/judgment 用文档值域）----------

const RESPONSE_JSON_SCHEMA = {
  type: "object",
  required: ["expression_gaps", "substantive_gaps", "overall_judgment"],
  properties: {
    expression_gaps: {
      type: "array",
      description: "表达性差距：用户有能力但没写出来",
      items: {
        type: "object",
        required: ["jd_requirement", "user_has_evidence", "where_to_add"],
        properties: {
          jd_requirement: { type: "string" },
          user_has_evidence: { type: "string" },
          where_to_add: { type: "string" },
        },
      },
    },
    substantive_gaps: {
      type: "array",
      description: "实质性差距：用户真的缺这个能力",
      items: {
        type: "object",
        required: ["jd_requirement", "severity", "interview_strategy"],
        properties: {
          jd_requirement: { type: "string" },
          severity: {
            type: "string",
            enum: ["hard_filter", "important", "nice_to_have"],
          },
          interview_strategy: {
            type: "string",
            description: "面试中如何应对，不超过 60 字",
          },
        },
      },
    },
    overall_judgment: {
      type: "string",
      enum: ["recommended", "improve_first", "skip"],
    },
  },
} as const;

// ---------- zod 二次校验（文档值域）----------

const rawSchema = z.object({
  expression_gaps: z.array(
    z.object({
      jd_requirement: z.string(),
      user_has_evidence: z.string(),
      where_to_add: z.string(),
    }),
  ),
  substantive_gaps: z.array(
    z.object({
      jd_requirement: z.string(),
      severity: z.enum(["hard_filter", "important", "nice_to_have"]),
      interview_strategy: z.string(),
    }),
  ),
  overall_judgment: z.enum(["recommended", "improve_first", "skip"]),
});

// ---------- 值域桥接：文档枚举 → types.ts 枚举 ----------

const SEVERITY_MAP: Record<
  z.infer<typeof rawSchema>["substantive_gaps"][number]["severity"],
  GapSeverity
> = {
  hard_filter: "hard_filter",
  important: "important",
  nice_to_have: "minor", // 文档 nice_to_have ↔ types.ts minor
};

const JUDGMENT_MAP: Record<
  z.infer<typeof rawSchema>["overall_judgment"],
  OverallJudgment
> = {
  recommended: "recommended",
  improve_first: "improve_first",
  skip: "not_recommended", // 文档 skip ↔ types.ts not_recommended
};

// ---------- Prompt 拼装 ----------

function buildPrompt(input: GapAnalysisInput): string {
  return [
    SYSTEM_PROMPT,
    "【参考示例】",
    FEW_SHOT_EXAMPLES,
    "【本次任务输入】",
    "母版所有段落：",
    formatSegments(input.segments),
    "",
    "JD 信息：",
    formatJobDescription(input.jobDescription),
    "",
    "请输出两类差距与整体建议，严格按 JSON Schema。",
  ].join("\n");
}

// ---------- 原始输出 → types.ts 契约 ----------

function toContract(raw: z.infer<typeof rawSchema>): GapAnalysisOutput {
  return {
    expressionGaps: raw.expression_gaps.map((g) => ({
      jdRequirement: g.jd_requirement,
      userHasEvidence: g.user_has_evidence,
      whereToAdd: g.where_to_add,
    })),
    substantiveGaps: raw.substantive_gaps.map((g) => ({
      jdRequirement: g.jd_requirement,
      severity: SEVERITY_MAP[g.severity],
      interviewStrategy: g.interview_strategy,
    })),
    overallJudgment: JUDGMENT_MAP[raw.overall_judgment],
    // 文档 2.6：匹配度由确定性加权命中率算法计算，AI 不打分。
    // 此处占位 0，待"匹配度评分模块"回填。
    overallScore: 0,
  };
}

/** Prompt #3：差距分析（表达性 vs 实质性）+ 整体投递建议 */
export async function analyzeGap(
  input: GapAnalysisInput,
): Promise<GapAnalysisOutput> {
  const raw = await runJsonTask({
    prompt: buildPrompt(input),
    responseJsonSchema: RESPONSE_JSON_SCHEMA as unknown as Record<string, unknown>,
    schema: rawSchema,
  });
  return toContract(raw);
}
