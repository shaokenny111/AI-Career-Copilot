// ============================================================================
// Prompt #8 JD 要求提取（只看 JD，不看简历）
// ----------------------------------------------------------------------------
// 把一份 JD 拆成结构化的要求清单，每条按文档 2.6 的 Hard / Title / Context 三档
// 标注权重档。这些要求是确定性匹配度评分的【分母全集】。
//
// 【最高铁律：只看 JD】
// 本任务的输入【只有 JD】，绝不传简历。原因：若 AI 同时看到简历，它会倾向于只报
// "简历能覆盖"的要求、悄悄略过简历没覆盖的硬门槛——分母被缩小，匹配度虚高，诚实
// 天花板被破坏。要求全集必须独立于简历存在。
//
// 铁律遵守：few-shot examples 固定内联、responseJsonSchema、zod 二次校验。
// 输入输出严格用 types.ts 的 ParseJdInput / ParseJdOutput。
// ============================================================================

import { z } from "zod";
import type {
  ParseJdInput,
  ParseJdOutput,
  RequirementImportance,
} from "../../types";
import { runJsonTask } from "./client";
import { formatJobDescription } from "./format";

// ---------- System Prompt ----------

const SYSTEM_PROMPT = `你是一名招聘需求分析专家，专精于把一份 JD 拆解成清晰、可逐条核对的"要求清单"。

【你的核心任务】
只阅读 JD（公司 / 职位 / 原文），提取出这个岗位对候选人的全部要求，每条标注权重档。

【最高铁律：只看 JD，不看简历】
你手里【没有】候选人的简历，也不要假设候选人有或没有某项能力。
你的任务是客观地把 JD 里"想要什么"全部列出来——包括那些候选人很可能不具备的硬门槛。
漏报任何一条 JD 写明的要求，都会让后续匹配度虚高、误导用户。宁可全列，不可漏列。

【三档权重判定（务必对齐档名）】

hard（硬性门槛）：
- JD 用"必须 / 要求 / 需要 / 至少 / 起"等措辞框定的筛选条件
- 典型：学历（"本科及以上"）、工作年限（"3 年以上经验"）、必备证书（"持有 CPA"）、
  必备硬技能、语言等级（"英语六级 / 雅思 7"）
- 这类达不到通常直接被刷

title（职位核心）：
- 与职位职责直接对应的核心能力——这份工作"主要在做什么"
- 典型：JD 主体职责段里反复出现的能力（如产品经理的"需求分析、产品规划"）

context（加分项）：
- JD 里"优先 / 加分 / 熟悉……者优先 / 有……经验更佳"的非必须项
- 软素质（"沟通能力强""有责任心""抗压"）也归此档

【拆分粒度】
- 一条要求只表达一个可独立核对的点。把"精通 SQL 和 Python"拆成两条。
- 但不要把同一能力的修饰语硬拆（"独立撰写行业研究报告"是一条，不要拆成"独立""撰写""报告"）。
- 用 JD 的原文措辞，不要改写、不要翻译（JD 是英文就用英文，是中文就用中文）。

【输出约束】
- requirements 通常 6-14 条；JD 很短时可少，但不要遗漏任何写明的门槛
- 每条必须给出 importance，三档之一
- 不要输出 JD 里没有的要求（不臆造）`;

// ---------- Few-shot Examples（固定内联）----------

const FEW_SHOT_EXAMPLES = `【示例 1：中文 JD】
输入：
公司: 字节跳动
职位: AI 产品经理
JD 原文: 负责 AI 产品的需求分析与产品规划，推动功能落地；要求本科及以上学历，3 年以上互联网产品经验；熟练使用 SQL 进行数据分析；有 AI / 大模型相关产品经验者优先；沟通能力强，能跨部门协作。
输出：
{
  "requirements": [
    { "text": "本科及以上学历", "importance": "hard" },
    { "text": "3 年以上互联网产品经验", "importance": "hard" },
    { "text": "熟练使用 SQL 进行数据分析", "importance": "hard" },
    { "text": "AI 产品的需求分析与产品规划", "importance": "title" },
    { "text": "推动功能落地", "importance": "title" },
    { "text": "AI / 大模型相关产品经验", "importance": "context" },
    { "text": "沟通能力强", "importance": "context" },
    { "text": "跨部门协作", "importance": "context" }
  ]
}
说明："有……者优先"是 context；学历 / 年限 / 必备硬技能是 hard；主体职责是 title。

【示例 2：英文 JD（保留英文原词，不翻译）】
输入：
公司: Acme Corp
职位: Data Analyst
JD 原文: We are looking for a Data Analyst to build dashboards and deliver business insights. Requirements: Bachelor's degree in a quantitative field; 2+ years of experience in data analysis; proficient in SQL and Python; experience with Tableau is a plus; strong cross-functional collaboration skills.
输出：
{
  "requirements": [
    { "text": "Bachelor's degree in a quantitative field", "importance": "hard" },
    { "text": "2+ years of experience in data analysis", "importance": "hard" },
    { "text": "proficient in SQL", "importance": "hard" },
    { "text": "proficient in Python", "importance": "hard" },
    { "text": "build dashboards", "importance": "title" },
    { "text": "deliver business insights", "importance": "title" },
    { "text": "experience with Tableau", "importance": "context" },
    { "text": "strong cross-functional collaboration skills", "importance": "context" }
  ]
}
说明："proficient in SQL and Python"拆成两条；"is a plus"是 context；用英文原词，不翻译成中文。`;

// ---------- responseJsonSchema（snake_case）----------

const RESPONSE_JSON_SCHEMA = {
  type: "object",
  required: ["requirements"],
  properties: {
    requirements: {
      type: "array",
      items: {
        type: "object",
        required: ["text", "importance"],
        properties: {
          text: { type: "string", description: "要求文本，保留 JD 原文措辞与语言" },
          importance: {
            type: "string",
            enum: ["hard", "title", "context"],
          },
        },
      },
    },
  },
} as const;

// ---------- zod 二次校验 ----------

const rawSchema = z.object({
  requirements: z.array(
    z.object({
      text: z.string(),
      importance: z.enum(["hard", "title", "context"]),
    }),
  ),
});

// ---------- Prompt 拼装 ----------

function buildPrompt(input: ParseJdInput): string {
  // 可复现铁律：要求清单只取决于【职位 + JD 正文】，与公司名无关。把公司名置空，
  // 确保"麦肯锡 / McKinsey"这类纯公司名差异不会改变要求清单（=评分分母），从根上
  // 消除"同一份 JD 仅公司名中英不同 → 分数漂"的不可复现。
  const jdForExtract = { ...input.jobDescription, company: "" };
  return [
    SYSTEM_PROMPT,
    "【参考示例】",
    FEW_SHOT_EXAMPLES,
    "【本次任务输入】",
    "JD 信息（只有这份 JD，没有简历；公司名与要求无关，已略去）：",
    formatJobDescription(jdForExtract),
    "",
    "请提取全部要求并逐条标注权重档，严格按 JSON Schema 输出 requirements。",
  ].join("\n");
}

// ---------- 原始输出 → types.ts 契约 ----------

function toContract(raw: z.infer<typeof rawSchema>): ParseJdOutput {
  return {
    requirements: raw.requirements
      .map((r) => ({
        text: r.text.trim(),
        importance: r.importance as RequirementImportance,
      }))
      .filter((r) => r.text.length > 0),
  };
}

/** Prompt #8：只看 JD，提取结构化要求清单（带权重档），作为匹配度分母全集 */
export async function parseJd(input: ParseJdInput): Promise<ParseJdOutput> {
  const raw = await runJsonTask({
    prompt: buildPrompt(input),
    responseJsonSchema: RESPONSE_JSON_SCHEMA as unknown as Record<string, unknown>,
    schema: rawSchema,
    temperature: 0, // 要求清单是评分分母/差距全集，必须可复现
  });
  return toContract(raw);
}
