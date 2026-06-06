// ============================================================================
// Prompt #9 要求 ↔ bullet 语义映射（跨语言）
// ----------------------------------------------------------------------------
// 编译期一次性建立映射：对每条 JD 要求，判断哪些已改写的 bullet 在【语义上】覆盖
// 了它，输出 requirement_id → bullet_ids。运行期 scoring 只读这张映射做确定性加权，
// 绝不再跑 AI。
//
// 【本任务的核心价值：跨语言语义对齐】
// 中文简历投英文岗位（或反之）是主场景。判定必须基于"能力是否相同"，而非字面是否
// 相同：英文要求 "cross-functional collaboration" 与中文 bullet "跨部门协作"是同一
// 能力，必须判为命中。
//
// 【诚实原则】
// 一条要求若没有任何 bullet 真正覆盖，bullet_ids 留空数组——不要为了"好看"硬凑。
// 未覆盖的要求会留在匹配度分母里，把分数诚实地压在天花板以下，这正是产品价值所在。
//
// 铁律遵守：few-shot examples 固定内联、responseJsonSchema、zod 二次校验。
// 输入输出严格用 types.ts 的 MatchRequirementsInput / MatchRequirementsOutput。
// ============================================================================

import { z } from "zod";
import type {
  MatchRequirementsInput,
  MatchRequirementsOutput,
} from "../../types";
import { runJsonTask } from "./client";

// ---------- System Prompt ----------

const SYSTEM_PROMPT = `你是一名简历匹配分析专家，专精于判断"一段简历表述是否真正满足了一条岗位要求"。

【你的核心任务】
给你一份"JD 要求清单"（每条带 id）和一份"简历 bullet 清单"（每条带 id）。
对【每一条要求】，找出所有在语义上覆盖了它的 bullet，输出该要求 id 对应的 bullet id 列表。

【判定标准：看能力，不看字面】

1. 跨语言对齐（核心）
- 判定基于"能力 / 经验是否相同"，不要求语言或用词一致。
- 例：要求 "cross-functional collaboration" ↔ bullet "负责跨部门协作推进项目" → 命中
- 例：要求 "数据分析" ↔ bullet "Built dashboards and delivered business insights with SQL" → 命中

2. 语义等价也算命中
- 同一能力的不同说法算命中（"用户调研" ↔ "用户研究"；"SQL 数据查询" ↔ "数据库查询分析"）。

3. 一对多 / 多对一都允许
- 一条要求可被多条 bullet 覆盖；一条 bullet 也可覆盖多条要求。

【硬门槛需强证据（收紧 —— 高分区必须有分辨率）】
以下几类要求，必须简历有【明确、等量】的对应证据才判命中；证据偏弱、相关但不等同的，
一律按【不满足】处理（不要把那条 bullet 收进 bullet_ids），不要慷慨命中：

1. 年限类（如 "3+ years of ...", "X 年以上经验"）：
   - 简历须能推断出【达到该年限】的对应经历。时长不足 / 仅实习 / 未写明时长 → 不满足。
   - 仅"做过相关领域的技能工作"（数据清洗、建模、写报告等）而无明确年限证据 → 不满足。
2. 领导 / 管理 / 带团队类（如 "leading the ... of products", "领导 / 管理 / 带团队",
   "proven record of leadership"）：
   - 须有【明确的领导 / 管理职责或牵头 / 带人事实】的证据（带过团队、任项目负责人、牵头推动某事）。
   - 仅"做过相关领域的技能工作"（数据清洗、回归建模、写报告、个人独立产出）≠ 领导经验 → 不满足。
   - 复合要求（如 "2+ years of experience in leading ..." 同时含年限 + 领导）须【两项证据同时具备】，
     缺年限或缺领导职责，任一缺失即不满足，不得用一条技能 bullet 半凑。
3. 语言流利度类（如 "fluent / professional English", "native-level", "business-level"）：
   - 须有【以该语言实际工作或产出】的证据（英文工作环境、英文报告 / PRD、该语言授课的学位等）。
   - 仅有【考试分数】（IELTS 6.5、CET-6、TOEIC…）属"部分满足"，不等同"流利 / 专业级" → 不满足。
4. 特定平台 / 系统 / 技术经历类（如 "experience with Tableau", "recommendation systems",
   "A/B testing platform", "large-scale data pipelines"）：
   - 须有【明确做过该平台 / 系统 / 技术】的证据。仅是相关领域、相邻技能、上位概念 → 不满足。
5. 学历类——区分"最低门槛"与"额外限定"（针对真实假阳性）：
   - 最低学历门槛（"本科及以上 / Bachelor's degree or above / undergraduate degree required"）：
     更高学历【向上兼容】——硕士 / 博士 bullet【满足】"本科及以上"要求（这是常识，没有 HR 会因为
     你是硕士就判你不满足本科门槛）。本科 bullet 满足"本科及以上"。仅反向不满足：要求硕士、
     bullet 只有本科 → 层级不够 → 不满足。
   - 真正要收紧的是【带额外限定的复合要求】：要求里含"杰出 / 卓越 / 顶尖学术成就""特定奖项"
     "特定 GPA / 排名"等【需具体个人证据】的限定时，光有学历或学校排名【不足以】满足该限定。
     须简历有对应的【具体个人成就证据】（顶刊 / 竞赛大奖 / GPA 专业前列 / 具体荣誉）才判命中；
     没有 → 整条复合要求【不满足】，留差距。
   - 关键辨析：学校排名（如 QS21、985/211）是【学校层面】属性，≠【个人】杰出学术成就；
     不能用学校排名顶"杰出学术成就"这类个人限定。
   - 与语言无关：中文"硕士" ↔ 英文 "Master's" 同层级照常对应；收紧只针对"额外限定缺具体证据"。

【满足强度 ≠ 语言差异，别混淆】
- 收紧只针对【证据强度】，绝不针对语言。跨语言 / 同义改写仍是强证据
  （"跨部门协作" ↔ "cross-functional collaboration" 照常命中）——能力等量、仅语言不同，不扣分。
- "相关但不等同" = 不满足。宁可漏判、让要求留在分母（诚实天花板），也不慷慨命中。
- 这关系到产品诚实锚点：诚实 = 不造假 + 不虚高。一个谁投都顶格的分数对求职者毫无决策价值。

【诚实红线 —— 不要硬凑】
- 只有当 bullet 真正体现了该要求的能力时才算命中。
- 仅仅"相关 / 沾边 / 同一领域"不算命中。
  例：要求"3 年以上产品经验"，bullet 是"实习 3 个月做产品助理" → 不命中（年限不够）。
  例：要求"精通 Python"，bullet 只说"了解编程基础" → 不命中。
- 一条要求若没有任何 bullet 真正覆盖，就给空数组 []。漏判会让用户虚假乐观，比错杀更糟。

【输出约束】
- 必须为输入里的【每一条要求 id】各输出一个条目（即使 bullet_ids 为空）。
- requirement_id 和 bullet_ids 只能用输入中给出的 id 原样照抄，不要发明新 id。`;

// ---------- Few-shot Examples（固定内联；含跨语言关键例子）----------

const FEW_SHOT_EXAMPLES = `【示例：中文简历投英文岗位（跨语言命中 + 诚实留空）】
输入要求：
- [req_a] 2+ years of experience in data analysis
- [req_b] proficient in SQL
- [req_c] strong cross-functional collaboration skills
- [req_d] experience with Tableau

输入 bullet：
- [blt_1] 在国元证券担任数据分析师两年，独立完成业务数据分析
- [blt_2] 熟练使用 SQL 进行数据查询与清洗
- [blt_3] 负责跨部门协作，推动数据需求落地

输出：
{
  "matches": [
    { "requirement_id": "req_a", "bullet_ids": ["blt_1"] },
    { "requirement_id": "req_b", "bullet_ids": ["blt_2"] },
    { "requirement_id": "req_c", "bullet_ids": ["blt_3"] },
    { "requirement_id": "req_d", "bullet_ids": [] }
  ]
}
说明：
- req_c（英文"cross-functional collaboration"）↔ blt_3（中文"跨部门协作"）= 跨语言同一能力 → 命中。
- req_a（英文"data analysis"）↔ blt_1（中文"数据分析"）→ 命中。
- req_d（Tableau）没有任何 bullet 提到 → 空数组，诚实留空，不要拿 blt_2(SQL) 硬凑。

【示例 2：硬门槛需强证据 —— 弱证据判不满足（与示例 1 同等重要）】
输入要求：
- [req_x] Fluent professional English
- [req_y] 3+ years of product management experience
- [req_z] Hands-on experience with recommendation systems

输入 bullet：
- [blt_a] 雅思 6.5；法语基础
- [blt_b] 项目经理助理（2023.07 至今），独立编写需求文档与流程图
- [blt_c] 用 Python 搭建客户违约预警规则原型，被风控团队采纳为辅助参考

输出：
{
  "matches": [
    { "requirement_id": "req_x", "bullet_ids": [] },
    { "requirement_id": "req_y", "bullet_ids": [] },
    { "requirement_id": "req_z", "bullet_ids": [] }
  ]
}
说明：
- req_x：IELTS 6.5 只是考试分数，不等同"流利专业英语"——"部分满足"按【不满足】处理，留空。
- req_y：助理岗约 1-2 年且偏助理职责，达不到"3 年以上产品经验"——年限不足，不满足。
- req_z：违约预警规则原型与"推荐系统"是不同系统，相关但不等同——不满足。
- 对照示例 1：跨语言"跨部门协作 ↔ cross-functional collaboration"是【能力等量、仅语言不同】→ 命中；
  本例是【证据强度不足】→ 不命中。区别在证据强度，不在语言。

【示例 3：语言类——真实语言实战是强证据，判命中（与示例 2 的考试分数严格对照）】
输入要求：
- [req_p] 有效地用英语和中文口头及书面传达复杂思想
- [req_q] Fluent professional English

输入 bullet：
- [blt_m] 在汇丰全英文工作环境中与跨区域团队协作，用英文撰写财务分析报告并向各级同事汇报复杂结论

输出：
{
  "matches": [
    { "requirement_id": "req_p", "bullet_ids": ["blt_m"] },
    { "requirement_id": "req_q", "bullet_ids": ["blt_m"] }
  ]
}
说明：
- "全英文工作环境 / 英文跨区域协作 / 英文撰写报告与汇报"是【以该语言实际工作并产出】的强证据 → 命中
  （req_q 的 "fluent professional English" 与 req_p 的双语传达都被这条覆盖）。
- 严格对照示例 2 的 req_x：那里只有 IELTS 6.5（仅考试分数）→ 不满足；这里是真实语言实战 → 满足。
  收紧只打"考试分数撑流利"的虚高，绝不打"真实语言工作经历"——边界在证据是否为实战，不在语言本身。

【示例 4：年限 / 领导复合硬门槛——技能 bullet 不能冒充"年限 + 领导"（针对真实假阳性）】
输入要求：
- [req_k] 2+ years of experience in leading the planning, design, and scaling of digital products
- [req_l] Proven record of leadership in a professional or academic setting

输入 bullet：
- [blt_p] 用 R 语言完成金融数据清洗、预处理与回归 / 时间序列建模，输出投资组合回测结果
- [blt_q] 独立完成 3 篇行业深度报告，运用数据分析方法拆解商业模式与竞争格局

输出：
{
  "matches": [
    { "requirement_id": "req_k", "bullet_ids": [] },
    { "requirement_id": "req_l", "bullet_ids": [] }
  ]
}
说明：
- req_k 同时要"2+ 年"年限 + "领导…数字产品"职责。blt_p / blt_q 是【数据 / 研究类技能工作】，
  既推不出达到 2+ 年，也没有任何"领导 / 带团队 / 牵头数字产品"的职责证据——做过相关技能 ≠ 领导年限 → 留空。
- req_l 要"领导力记录"，两条 bullet 都是个人技能产出，无带人 / 牵头 / 负责人事实 → 不满足。
- 严格对照示例 1 的 req_c（"跨部门协作 ↔ cross-functional collaboration"，能力等量 → 命中）：
  本例的差别不在语言，而在【证据类型不对口】——拿"做过技能工作"去顶"年限 / 领导"这类必须有专属证据的硬门槛，一律不命中。

【示例 5：学历——最低门槛向上兼容，但"额外限定"需具体个人证据（针对真实假阳性）】
输入要求：
- [req_e] 本科及以上学历，且有杰出的学术成就
- [req_f] Bachelor's degree or above

输入 bullet（情形一）：
- [blt_g] 顶尖商学院金融硕士，所在院校 QS 世界排名第 21

输出（情形一）：
{
  "matches": [
    { "requirement_id": "req_e", "bullet_ids": [] },
    { "requirement_id": "req_f", "bullet_ids": ["blt_g"] }
  ]
}
说明（情形一）：
- req_f 只是"本科及以上"最低门槛 → 硕士向上兼容、满足 → 命中（绝不因"是硕士"就拒本科门槛）。
- req_e 是【复合要求】="本科及以上" + "杰出学术成就"：学历门槛满足，但"杰出学术成就"需具体
  个人证据；blt_g 只有"QS21"（学校排名 = 学校层面属性，≠ 个人杰出学术成就）→ 该额外限定缺
  证据 → 整条 req_e【不满足】，留差距。

输入 bullet（情形二，同一条 req_e，换一条有具体成就证据的 bullet）：
- [blt_h] 金融学本科，GPA 3.9/4.0（专业前 5%），获全国大学生数学建模竞赛一等奖

输出（情形二）：
{
  "matches": [
    { "requirement_id": "req_e", "bullet_ids": ["blt_h"] }
  ]
}
说明（情形二）：
- blt_h 既满足"本科及以上"，又有【具体个人成就证据】（GPA 专业前 5% + 全国竞赛一等奖）
  → "杰出学术成就"这一额外限定被坐实 → req_e 整条【命中】。
- 对照情形一：差别在"杰出学术成就"有无【个人】证据——学校排名顶不了个人成就限定。
  这是【限定缺证据】，不是语言或层级差异。`;

// ---------- responseJsonSchema（snake_case）----------

const RESPONSE_JSON_SCHEMA = {
  type: "object",
  required: ["matches"],
  properties: {
    matches: {
      type: "array",
      items: {
        type: "object",
        required: ["requirement_id", "bullet_ids"],
        properties: {
          requirement_id: { type: "string" },
          bullet_ids: {
            type: "array",
            items: { type: "string" },
            description: "命中该要求的 bullet id；无覆盖则为空数组",
          },
        },
      },
    },
  },
} as const;

// ---------- zod 二次校验 ----------

const rawSchema = z.object({
  matches: z.array(
    z.object({
      requirement_id: z.string(),
      bullet_ids: z.array(z.string()),
    }),
  ),
});

// ---------- 输入序列化 ----------

function formatRequirements(reqs: MatchRequirementsInput["requirements"]): string {
  return reqs.map((r) => `- [${r.id}] ${r.text}`).join("\n");
}

function formatBullets(bullets: MatchRequirementsInput["bullets"]): string {
  return bullets.map((b) => `- [${b.id}] ${b.text}`).join("\n");
}

// ---------- Prompt 拼装 ----------

function buildPrompt(input: MatchRequirementsInput): string {
  return [
    SYSTEM_PROMPT,
    "【参考示例】",
    FEW_SHOT_EXAMPLES,
    "【本次任务输入】",
    "JD 要求清单：",
    formatRequirements(input.requirements),
    "",
    "简历 bullet 清单：",
    formatBullets(input.bullets),
    "",
    "请对每一条要求 id 输出其命中的 bullet id 列表（无覆盖给空数组），严格按 JSON Schema。",
  ].join("\n");
}

// ---------- 原始输出 → types.ts 契约（含 id 合法性防御）----------

function toContract(
  raw: z.infer<typeof rawSchema>,
  input: MatchRequirementsInput,
): MatchRequirementsOutput {
  const knownReq = new Set(input.requirements.map((r) => r.id));
  const knownBullet = new Set(input.bullets.map((b) => b.id));

  // 收敛到合法 id：丢弃 AI 臆造的 requirement_id / bullet_id（防止脏映射进评分）
  const byReq = new Map<string, Set<string>>();
  for (const m of raw.matches) {
    if (!knownReq.has(m.requirement_id)) continue;
    const set = byReq.get(m.requirement_id) ?? new Set<string>();
    for (const bid of m.bullet_ids) {
      if (knownBullet.has(bid)) set.add(bid);
    }
    byReq.set(m.requirement_id, set);
  }

  // 确保每条要求都有条目（AI 漏给的补空数组——分母完整，诚实天花板不被绕过）
  const matches = input.requirements.map((r) => ({
    requirementId: r.id,
    bulletIds: Array.from(byReq.get(r.id) ?? []),
  }));

  return { matches };
}

/** Prompt #9：编译期建立"要求↔bullet"语义映射（跨语言），供运行期确定性评分 */
export async function matchRequirements(
  input: MatchRequirementsInput,
): Promise<MatchRequirementsOutput> {
  // 没有要求或没有 bullet 时不必调用 AI：每条要求映射为空，全部进分母
  if (input.requirements.length === 0 || input.bullets.length === 0) {
    return {
      matches: input.requirements.map((r) => ({
        requirementId: r.id,
        bulletIds: [],
      })),
    };
  }

  const raw = await runJsonTask({
    prompt: buildPrompt(input),
    responseJsonSchema: RESPONSE_JSON_SCHEMA as unknown as Record<string, unknown>,
    schema: rawSchema,
    temperature: 0, // 满足/未满足判定直接决定评分分子与差距，必须可复现
  });
  return toContract(raw, input);
}
