// ============================================================================
// Prompt #3 面试应对策略（退化版：只给"已确定未满足"的 JD 要求写应对话术）
// ----------------------------------------------------------------------------
// 统一主线：一条 JD 要求只有一份判断。
//   · 谁是差距：由 #9 满足判定确定（未满足 = 差距），#3 不再自己判。
//   · 多严重：由 #8 的 importance 直接映射（hard/title/context），#3 不再自己判。
//   · #3 只剩一件事：对每条【已确定未满足】的要求，写一条诚实、可操作的面试应对话术，
//     保留"差距怎么办"的诚实锚点。
//
// 输入：已确定未满足的要求（id+文本+重要度）+ JD + 母版段落（上下文）。
// 输出：requirementId → interviewStrategy。
// temperature=0（话术也间接服务诚实展示，求稳定可复现）。
// 铁律遵守：few-shot 固定内联、responseJsonSchema、zod 二次校验。
// ============================================================================

import { z } from "zod";
import type { GapStrategyInput, GapStrategyOutput } from "../../types";
import { runJsonTask } from "./client";
import { formatJobDescription, formatSegments } from "./format";

// ---------- System Prompt ----------

const SYSTEM_PROMPT = `你是一名诚实的求职教练。系统已经确定了候选人简历【未满足】的若干岗位要求，现在请你为【每一条】未满足的要求做两件事：① 写一条面试中如何诚实应对的话术（临场怎么说）；② 写一条能力建设/简历改进建议（指向未来怎么补）。

【关键边界（务必遵守）】
- 谁是差距、差距多严重，系统已经判好了，给你的就是结论。你【不要】重新评判某条是不是差距、也不要judge严重度。
- 不要输出任何"它其实满足/不算差距"之类的翻案。
- 必须为输入里的【每一条要求 id】各输出一个条目，一条都不能少、不要发明新 id。

【① 面试应对话术（interview_strategy）怎么写——指向临场】
- 不超过 60 字，具体可操作，不写"努力学习""多积累"这类空话。
- 诚实优先：不教候选人假装具备没有的能力；而是教他如何用【真实有的】可迁移经历去回应、
  如何坦诚差距并给出补足计划。可结合给到的母版经历找可迁移点。
- 例（年限不足）："坦诚年限差距，用 X 项目证明可独立交付，强调学习速度与已达成的结果。"
- 例（缺某平台经验）："说明用过相邻工具 Y、原理相通；面试前快速上手做一个小demo作敲门砖。"

【② 能力建设/简历改进建议（capability_advice）怎么写——指向未来】
- 适用范围：【只对 hard（硬性门槛）和 title（职位核心）档的要求写】。context（加分项）档一律留空字符串 ""。
- 与面试应对的区别：面试应对是"这次面试临场怎么说"；能力建设是"若想投这类岗位、未来该从哪些方面
  实打实地提升"，指向后续的简历与履历建设，不是临场话术。
- 不超过 60 字，必须具体、可执行，落到动作上（深化现有项目、补一段对口实习、把成果量化、
  考一个对口证书、做一个能展示该能力的作品）。严禁"多努力""多学习""提升自己"这类空话。
- 例（年限不足）："在当前项目里主动牵头一个完整模块，积累可写进简历的独立交付与带人经历。"
- 例（缺某平台经验）："用该平台做一个真实小项目并量化效果，把它写成一条带数据的项目经历。"`;

// ---------- Few-shot Examples（固定内联）----------

const FEW_SHOT_EXAMPLES = `【示例：3 条已确定未满足的要求 → 各一条应对话术 + 一条能力建设建议】
输入未满足要求：
- [req_1] 3+ years of product management experience  (hard)
- [req_2] Hands-on experience with recommendation systems  (title)
- [req_3] Fluent professional English  (context)
（母版可见：金融背景、AI 简历编译器个人项目、雅思 6.5）

输出：
{
  "strategies": [
    { "requirement_id": "req_1", "interview_strategy": "坦诚产品年限较短，用 AI 编译器从0到1的独立落地证明产品全流程能力，强调金融业务深度可迁移", "capability_advice": "把 AI 编译器做深做长，积累可量化的用户/留存数据，攒够一段完整的产品负责经历再投资深岗" },
    { "requirement_id": "req_2", "interview_strategy": "说明未直接做过推荐系统，但理解其评估逻辑；以违约预警规则原型类比，面试前补一份推荐系统竞品拆解", "capability_advice": "用公开数据集做一个推荐系统小项目，跑通召回/排序与评估指标，写成一条带数据的项目经历" },
    { "requirement_id": "req_3", "interview_strategy": "雅思6.5为基础，坦诚非母语级；准备英文自我介绍与项目讲解，强调可在英文环境快速适应", "capability_advice": "" }
  ]
}
说明：每条都给了面试应对；能力建设只对 hard(req_1)/title(req_2) 写，且落到具体动作；
context 档的 req_3 的 capability_advice 留空字符串。两者区别：应对=临场怎么说，能力建设=未来怎么补。`;

// ---------- responseJsonSchema（snake_case）----------

const RESPONSE_JSON_SCHEMA = {
  type: "object",
  required: ["strategies"],
  properties: {
    strategies: {
      type: "array",
      items: {
        type: "object",
        required: ["requirement_id", "interview_strategy", "capability_advice"],
        properties: {
          requirement_id: { type: "string" },
          interview_strategy: {
            type: "string",
            description: "面试如何诚实应对该差距（临场怎么说），不超过 60 字",
          },
          capability_advice: {
            type: "string",
            description:
              "能力建设/简历改进建议（指向未来怎么补），仅 hard/title 档写，context 档留空字符串，不超过 60 字",
          },
        },
      },
    },
  },
} as const;

// ---------- zod 二次校验 ----------

const rawSchema = z.object({
  strategies: z.array(
    z.object({
      requirement_id: z.string(),
      interview_strategy: z.string(),
      capability_advice: z.string().optional().default(""),
    }),
  ),
});

// ---------- 输入序列化 ----------

function formatUnsatisfied(
  reqs: GapStrategyInput["unsatisfiedRequirements"],
): string {
  return reqs
    .map((r) => `- [${r.id}] ${r.text}  (${r.importance})`)
    .join("\n");
}

// ---------- Prompt 拼装 ----------

function buildPrompt(input: GapStrategyInput): string {
  return [
    SYSTEM_PROMPT,
    "【参考示例】",
    FEW_SHOT_EXAMPLES,
    "【本次任务输入】",
    "已确定未满足的 JD 要求（每条都要给一条话术，用原 id）：",
    formatUnsatisfied(input.unsatisfiedRequirements),
    "",
    "JD 信息：",
    formatJobDescription(input.jobDescription),
    "",
    "母版段落（仅供你找可迁移点写话术，不要据此翻案差距）：",
    formatSegments(input.segments),
    "",
    "请为每条要求 id 输出一条面试应对话术，严格按 JSON Schema。",
  ].join("\n");
}

// ---------- 原始输出 → types.ts 契约（含 id 合法性防御 + 补全）----------

function toContract(
  raw: z.infer<typeof rawSchema>,
  input: GapStrategyInput,
): GapStrategyOutput {
  const known = new Set(input.unsatisfiedRequirements.map((r) => r.id));
  const byId = new Map<string, { interviewStrategy: string; capabilityAdvice: string }>();
  for (const s of raw.strategies) {
    if (known.has(s.requirement_id) && !byId.has(s.requirement_id)) {
      byId.set(s.requirement_id, {
        interviewStrategy: s.interview_strategy.trim(),
        capabilityAdvice: s.capability_advice.trim(),
      });
    }
  }
  // 每条未满足要求都给一个条目（AI 漏的补空串——差距列表仍完整，只是该条无话术）。
  // 能力建设建议确定性收口：只保留 hard/title 档（context 档强制留空），与 prompt 口径一致。
  return {
    strategies: input.unsatisfiedRequirements.map((r) => {
      const hit = byId.get(r.id);
      return {
        requirementId: r.id,
        interviewStrategy: hit?.interviewStrategy ?? "",
        capabilityAdvice: r.importance === "context" ? "" : hit?.capabilityAdvice ?? "",
      };
    }),
  };
}

/** Prompt #3（退化版）：只为已确定未满足的要求生成面试应对话术 */
export async function generateGapStrategies(
  input: GapStrategyInput,
): Promise<GapStrategyOutput> {
  // 没有未满足要求 → 无需调用 AI
  if (input.unsatisfiedRequirements.length === 0) {
    return { strategies: [] };
  }
  const raw = await runJsonTask({
    prompt: buildPrompt(input),
    responseJsonSchema: RESPONSE_JSON_SCHEMA as unknown as Record<string, unknown>,
    schema: rawSchema,
    temperature: 0, // 服务诚实差距展示，求稳定可复现
  });
  return toContract(raw, input);
}
