# AI Resume Compiler · Prompt 系统设计文档

> **版本**：v1.0
> **文档用途**：定义所有 AI 任务的 Prompt 设计、输入输出 Schema、约束规则、测试用例
> **使用对象**：开发工程师（实现）、产品经理（验收）、测试人员（评估）
> **配套文档**：《AI Resume Compiler · 产品说明书》（产品全貌） + 本文档（AI 实现）

---

## 0. 文档导航

- [第 1 章：总体架构](#1-总体架构)（6 个 Prompt 的关系、调用顺序、并发设计）
- [第 2 章：技术规范](#2-技术规范)（Gemini API 配置、通用约束）
- [第 3 章：核心约束原则](#3-核心约束原则)（所有 Prompt 都遵循的底线）
- [第 4 章：Prompt #1 段落改写 + 信息来源标注](#4-prompt-1-段落改写--信息来源标注)
- [第 5 章：Prompt #2 内容相关性评估](#5-prompt-2-内容相关性评估)
- [第 6 章：Prompt #3 差距分析](#6-prompt-3-差距分析)
- [第 7 章：Prompt #4 简历类型识别](#7-prompt-4-简历类型识别)
- [第 8 章：Prompt #5 应届生 JD 驱动提问](#8-prompt-5-应届生-jd-驱动提问)
- [第 9 章：Prompt #6 STAR 格式转换](#9-prompt-6-star-格式转换)
- [第 10 章：测试与评估](#10-测试与评估)
- [第 11 章：常见问题与失败案例处理](#11-常见问题与失败案例处理)
- [附录 A：Prompt 设计的开源借鉴来源](#附录-a-prompt-设计的开源借鉴来源)
- [附录 B：迭代日志](#附录-b-迭代日志)

---

## 1. 总体架构

### 1.1 六个 Prompt 的关系图

```
[用户上传简历]
       │
       ▼
[#4 简历类型识别] ─────────────┐
       │                       │
       ▼ (A 类: 完整母版)        ▼ (B 类: 已精简)        (C 类: 半成品)
[直接进入 JD 输入]      [温和提示补充母版]      [#5 应届生 JD 驱动提问]
       │                       │                       │
       │                       │                       ▼
       │                       │              [用户回答口语化]
       │                       │                       │
       │                       │                       ▼
       │                       │              [#6 STAR 格式转换]
       │                       │                       │
       │                       │                       ▼
       └───────────────────────┴───────────────────────┘
                              │
                              ▼ (此时所有用户都已有母版)
                       [输入目标 JD]
                              │
                              ▼
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
        [#1 段落改写]  [#2 相关性评估]  [#3 差距分析]
              │              │              │
              └──────────────┼──────────────┘
                             │ (并行执行，结果合并)
                             ▼
                       [改写工作台]
                             │
                             ▼
                       [完成页 + 导出]
```

### 1.2 调用顺序与并发设计

**串行调用（必须）**：

- `#4 类型识别` 必须先执行——决定后续走哪条路径
- 在 C 类路径中：`#5 提问` → 用户回答 → `#6 STAR 转换` 必须按顺序

**并行调用（节省时间）**：

- 一旦有了母版和 JD，`#1`、`#2`、`#3` 三个 Prompt 同时发起
- 它们的输入相同（母版 segments + JD），互不依赖
- 这样用户等待时间从 3 倍单次调用降到 1 倍

**预期总耗时**：

| 用户类型 | 路径 | 总耗时 |
|---------|------|--------|
| A 类 | #4 → (#1∥#2∥#3) | 约 5-8 秒 |
| B 类 | #4 → 提示补充 → (#1∥#2∥#3) | 约 5-8 秒 |
| C 类 | #4 → #5 → 用户输入 → #6 → (#1∥#2∥#3) | 约 10-15 秒 + 用户输入时间 |

### 1.3 调用频次预估

每次完整使用产品的 AI 调用次数：

| Prompt | 调用次数 | 说明 |
|--------|---------|------|
| #4 | 1 次 | 每次上传一次 |
| #5 | 1 次 | 仅 C 类用户 |
| #6 | N 次 | C 类用户每个回答 1 次（5-8 次） |
| #1 | M 次 | 每段经历 1 次（通常 4-8 次） |
| #2 | 1 次 | 一次性评估所有段落 |
| #3 | 1 次 | 一次性输出差距 |

**典型 A 类用户**：1 + 6 + 1 + 1 = 9 次 AI 调用

**典型 C 类用户**：1 + 1 + 6 + 6 + 1 + 1 = 16 次 AI 调用

---

## 2. 技术规范

### 2.1 Gemini API 配置

所有 Prompt 使用相同的 API 配置：

```typescript
const config = {
  model: "gemini-2.0-flash",  // 或更高版本
  generationConfig: {
    temperature: 0.3,           // 低温度，保证输出稳定
    responseMimeType: "application/json",
    responseJsonSchema: SCHEMA  // 各 Prompt 对应的 Schema
  }
};
```

**关键参数说明**：

- `temperature: 0.3` —— 改写类任务需要稳定输出，不要发散
- `responseMimeType: "application/json"` —— 强制 JSON 输出
- `responseJsonSchema` —— Gemini 2.0+ 原生支持，保证输出结构

### 2.2 通用错误处理

每次 AI 调用都需要：

1. **Schema 验证**：用 Zod 或类似工具二次验证 LLM 输出
2. **失败 retry**：网络失败 / 格式错误 → retry 1 次
3. **降级方案**：retry 仍失败 → 返回原文 + 错误提示，不阻塞用户流程
4. **缓存**：相同输入 24 小时内缓存结果，避免重复调用

### 2.3 Token 控制

| Prompt | 输入预估 | 输出预估 | 总计 |
|--------|---------|---------|------|
| #1 | 1500 | 800 | ~2300 |
| #2 | 2000 | 600 | ~2600 |
| #3 | 2000 | 500 | ~2500 |
| #4 | 800 | 200 | ~1000 |
| #5 | 1500 | 800 | ~2300 |
| #6 | 500 | 400 | ~900 |

**单次完整使用预估 token 消耗**：

- A 类用户：约 15,000-20,000 tokens
- C 类用户：约 25,000-35,000 tokens

### 2.4 输入数据契约（基于真实测试补充于 2026-05）

所有 Prompt 的输入必须满足以下契约。真实测试证明：输入缺字段时，AI 会"脑补"补全，产生幻觉。防幻觉的根本手段是输入约束，不是 Prompt 措辞。

**强制字段（每段经历必带）**：

| 字段 | 类型 | 缺失后果 |
|------|------|---------|
| timeRange | { start, end } | AI 误判工作年限，把有经验者判成应届生 |
| isCurrent | boolean | 无法识别在职经历，可能误建议隐藏 |
| content | string（真实完整文本） | AI 脑补出用户没有的经历 |

**禁止事项**：
- 禁止传摘要（如"用户有 5 段经历"）——AI 会自己编 5 段内容填进去
- 禁止传残缺片段——AI 会按最可能的情况补全

**测试中实证的失败案例**：
- 缺 timeRange/isCurrent → #3 把有 PM 在职经验的用户误判为"应届生"，给出"坦诚应届生身份"的错误面试策略
- 传"用户母版含 5 段经历"摘要 → #2 凭空脑补出"辩论队队长""社团活动"等用户根本没有的经历

**根本原则**：传给 AI 的永远是结构化、完整、真实的简历数据。前端在调用任何 AI 任务前，必须先把简历解析为结构化 segments（含时间与在职状态），再传入。

### 2.5 Prompt 拼装规则（强制）

每个 Prompt 发给 Gemini 时，必须由三部分拼成，缺一不可：

1. System Prompt 正文（本文档各章 .4 节）
2. Few-shot Examples（本文档各章 .5 节）← 最易被遗漏，但分级/判断类任务高度依赖
3. 用户的真实结构化输入（符合 2.4 输入契约）

【血的教训】测试阶段曾只拼正文、漏掉 examples，导致 #1 分级全部失准。
examples 不是文档附录，是 Prompt 的固定组成部分。
gemini.ts 的 Prompt 拼装函数必须把 examples 作为常量内联，不得设为可选。

【哪些 Prompt 最依赖 examples】
#1 改写分级、#2 相关性评估、#6 STAR 转换 —— 这三个是"判断/分级"任务，examples 决定成败。
#4 类型识别、#3 差距分析 —— 中度依赖。
#5 应届生提问 —— examples 提供问题风格参考。

### 2.6 匹配度评分算法（加权命中率）

借鉴 Resume-Tailor-AI 的加权 ATS 评分。匹配度是【整份简历】对 JD 的
单一全局分数（0-100），不设单段分数。

【JD 要求的权重分级】
AI 解析 JD 时，为每条要求标注权重：
- Hard（硬性要求）= 2x：JD 明确的硬技能、硬性门槛（如"熟悉大模型""SQL"）
- Title（职位相关）= 1.5x：与目标职位强相关的能力（如"产品落地经验"）
- Context（业务背景/加分项）= 1x：锦上添花项（如"有金融背景优先"）

【分数计算】
全局匹配度 = 命中要求的加权和 / JD 全部要求的加权和 × 满分区间

- 改写前分数：原始简历命中的加权和算出基础分
- 当前分数：随用户采纳的 bullet 动态计算
  · 绿色/黄色 bullet 默认采纳，其命中的要求计入
  · 红色 bullet 仅在用户确认"我有"后，其命中的要求才计入
  · 用户拒绝红色 → 对应要求不计入，分数不上涨（诚实原则）

【关键原则】
- 分数随采纳实时变化，必须诚实反映"用户当前实际采纳的内容"
- 拒绝 AI 补充内容导致分数不涨，是正确行为，不是 bug
- 不用 AI 直接打分（会漂移、不可解释），只用确定性的加权命中率

【一条要求命中的判定】
某条 JD 要求被"命中" = 至少有一条已采纳的 bullet 包含该要求的关键词。
关键词归一化借鉴 Resume-Matcher（如 SQL=结构化查询语言视为同一词）。

### 2.7 匹配度四级分级（分数 → 行动建议）

匹配度分数(0-100)向用户呈现时，按四级分档，每档对应明确的颜色和行动建议。
分数本身可解释（加权命中率），分级让用户一眼知道"该不该投、要不要改"。

| 分数区间 | 等级 | 颜色 | 含义 / 行动建议 |
|---------|------|------|----------------|
| 80-100  | 强匹配 | 🔵 indigo #4f46e5 | 匹配度高，建议直接投递 |
| 70-80   | 基本匹配 | 🟢 green #059669 | 可以投递 |
| 60-70   | 建议改进后投递 | 🟡 amber #d97706 | 再优化一下表达或补充经历 |
| <60     | 差距较大 | 🔴 rose #e11d48 | 与岗位差距较大，建议补充经历或谨慎投递 |

【呈现规范】
- 分数数字、进度环、分数块都按所在档位上色
- 分数块/卡片用同色系的浅色边框（如强匹配配浅紫边 #c7d2fe）
- 旁边附等级文字标签，不让用户自己判断分数高低
- 多个子版并列时（子版库），靠颜色即可快速区分匹配高低

【措辞原则】
- 低分档不用"不匹配"这类挫败性措辞，改用"差距较大，建议补充经历"
- 呼应产品理念：诚实指出差距，但始终给出路，不打击用户
- 与实质性差距的表达一致（"JD 要求 X，建议 xxx"，而非"你缺 X"）

【边界说明】
- 四级阈值（60/70/80）是产品定义，非算法硬约束，后续可根据真实数据微调
- "同岗位前 X%" 这类百分位表达（产品说明书完成页）是补充信息，与四级分级并存
---

## 3. 核心约束原则

**所有 Prompt 都必须遵循的底线**。

### 3.1 不编造事实（No Fabrication）

- 不要凭空增加用户没做过的事
- 不要假设具体数字（如果原文没有"60 个学生"，不要写"60 个学生"）
- 不要假设职位等级（如果原文是"参与"，不要改成"主导"）

### 3.2 最小化修改（Minimal Edits）

- 优先保留原文表达
- 改写后用户能在文字中认出原句的影子
- 不做大段重写

### 3.3 保留 JD 原词（Preserve JD Terminology）

- 当 JD 用某个特定术语，改写时使用 JD 的原词
- 不做同义改写（"React.js" 不要改成"前端框架"）
- ATS 系统按精确字符匹配，同义改写会丢分

### 3.4 诚实优于讨好（Honesty First）

- 不要为了让用户开心而扭曲判断
- 实质性差距不能说成表达性差距
- 低相关度的经历必须诚实标 low

### 3.5 透明可追溯（Transparent Reasoning）

- 每个 AI 决策都必须有 reason 字段
- 用户能看到 AI 怎么想、为什么这么想
- 不要让 AI 输出黑盒结果

### 3.6 用户保留决策权（User Retains Control）

- AI 给建议，用户做决定
- 不要让 AI 直接替用户行动
- 红色等级（缺失补充）必须强制用户确认

---

## 4. Prompt #1 段落改写 + 信息来源标注

### 4.1 目的

针对一段经历 + JD，输出改写后的 bullet point，并明确标注每条改写的"信息来源等级"。

**这是整个产品的差异化核心**。

### 4.2 输入数据结构

```typescript
interface RewriteInput {
  original_segment: {
    type: '工作经历' | '项目经历' | '教育背景' | '技能';
    title: string;
    content: string;
    bullets?: string[];
  };
  job_description: {
    raw_text: string;
    extracted_keywords: {
      hard_skills: string[];
      title_function: string[];
      business_context: string[];
    };
    requirements: string[];
  };
}
```

### 4.3 输出 JSON Schema

```json
{
  "type": "object",
  "required": ["bullets"],
  "properties": {
    "bullets": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "rewritten_text",
          "source_level",
          "what_changed",
          "why_changed",
          "matched_jd_phrases"
        ],
        "properties": {
          "rewritten_text": {
            "type": "string",
            "description": "改写后的最终文本"
          },
          "original_text": {
            "type": "string",
            "description": "对应的原文 bullet。如果是缺失补充则为空字符串"
          },
          "source_level": {
            "type": "string",
            "enum": ["green", "yellow", "red"]
          },
          "what_changed": {
            "type": "string",
            "description": "简洁说明改了什么，不超过 30 字"
          },
          "why_changed": {
            "type": "string",
            "description": "为什么这么改，关联 JD 需求，不超过 50 字"
          },
          "matched_jd_phrases": {
            "type": "array",
            "items": { "type": "string" }
          }
        }
      }
    }
  }
}
```

### 4.4 System Prompt 全文

```
你是一名专业的简历优化顾问，专精于针对具体岗位优化求职者的简历表达。

【你的核心任务】
接收一段简历经历和一份 JD，输出一组改写后的 bullet point，并明确标注每条改写的"信息来源等级"，让求职者清楚知道哪些是基于原简历、哪些是 AI 推测。

【核心原则】

1. 最小化修改原则（Minimal Edits）
- 优先保留原文表达，只在必要时改写
- 改写后用户能在文字中认出原句的影子
- 不做大段重写，除非原文表达极度模糊
- 反例：原文"做过数据分析" → 不要改成"主导跨部门数据决策中枢的搭建"（这是再创作，不是改写）
- 正例：原文"做过数据分析" → 改为"具备业务数据分析能力，能从数据中提炼洞察"（在原意基础上对齐JD表达，不塞入原文没有的数字占位符）

2. 不编造事实原则（No Fabrication）
- 不要凭空增加用户没做过的事情
- 不要假设具体数字（如果原文没有"60 个学生"，不要写"60 个学生"）
- 不要假设职位等级（如果原文是"参与"，不要改成"主导"，除非有依据）
- 唯一允许"推测"的情况：JD 强烈需要某能力，原文上下文暗示用户可能有 → 此时必须标注为 red

3. 保留 JD 原词原则（Preserve JD Terminology）
- 当 JD 用某个特定术语（如"用户研究"而不是"用户调研"），改写时使用 JD 的原词
- 不要做同义改写（"React.js"不要改成"前端框架"）
- ATS 系统按精确字符匹配，同义改写会丢分

4. 量化原则（只保留已有数字）（Quantify when possible）
- 原文已有数字 → 保留
- 原文没有数字 → 不要主动添加占位符，是否量化交给用户在前端补充
- 不要凭空捏造精确数字

【信息来源等级判定 —— 统一判断流程】

【最高约束】
你只能基于原文【已有的文字】改写。原文里没有的事实、技能、场景、对象，
一律不准写进 green 或 yellow。如果 JD 需要但原文没有，只能作为 red 单独列出。

判断从简：
- 改写只动了表达（换词/调序/合并/对齐JD术语），原文事实没变 → green
- 原文完全没有、但JD需要、你想补 → red（original_text 留空）
- 不要用 yellow 来容纳"我觉得他大概有"的内容。yellow 仅用于：
  原文有明确的上位词，你替换成JD的下位词（"数据库"→"SQL"这一种情况）

对每一条改写，按顺序问自己三个问题，命中即停：

第一问：改写有没有引入原文【没有的新事实】？（新工具、新场景、新职责、新数字、新对象）
  → 没有，只是换词/调序/合并/对齐JD术语 → 🟢 green，判定结束

第二问：这个新事实，能在原文里用 Ctrl+F 搜到【对应的词】吗？
  → 搜得到（原文有字面线索，只是做了延伸）→ 🟡 yellow，判定结束
    例：原文"会用数据库"→改"SQL"（"数据库"是字面线索）

第三问：搜不到对应的词，是靠【公司属性/行业惯例/岗位常识】推断的吗？
  → 是 → 🔴 red，original_text 留空，等用户确认
    例：原文"尽职调查"→补"数据分析"（靠"尽调通常做数据分析"推断，原文无"数据分析"字样）
    例：原文"月度报表"→补"向管理层汇报"（靠"报表通常给管理层"推断，原文无"管理层"字样）

【三档的关键区分】
- green = 没动事实，只动表达（术语对齐、调序、合并都算 green，不要因为"动了字"就升 yellow）
- yellow = 加了事实，但原文有字面线索
- red = 加了事实，原文无字面线索，纯靠行业常识

【两条硬规则】
1. red 不超过全部 bullet 的 30%
2. 不要画蛇添足：原文没数字时，不要主动塞"X+篇""X+人"占位符。原文已匹配JD的bullet，保持原样优化即可。

【为什么 red 边界至关重要】
yellow 前端不强制确认，red 强制弹窗确认。把"靠行业常识推断"的内容标成 yellow，用户会在无意识中把没做过的事写进简历，摧毁本产品"信息来源透明"的核心价值。

【关键反例 - 必须避免】

❌ 错误改写示例 1（过度发挥）：
原文："参与汽车行业研究，撰写研究报告"
错误改写："独立主导新能源汽车产业链深度研究，输出 12 份获得高管层采纳的战略报告"
错误原因：把"参与"改成"独立主导"、捏造"12 份"和"高管层采纳"——这是编造

✅ 正确改写：
"参与新能源汽车板块行业研究，撰写多份行业分析报告"
（保留"参与"，只是把"汽车行业"具体化到"新能源汽车板块"——这是基于行业知识的合理细化）

❌ 错误改写示例 2（同义替换丢失关键词）：
JD 要求："熟练使用 SQL"
原文："会用数据库"
错误改写："熟悉数据库操作和查询语言"
错误原因：把可以直接改成"SQL"的地方，改成了"数据库操作和查询语言"——丢失 ATS 匹配

✅ 正确改写：
"熟练使用 SQL 进行业务数据查询和分析"
（标注为 yellow——因为原文只说"数据库"，但合理推断包含 SQL）

【输出格式约束】

- 必须返回符合 schema 的 JSON
- 每条改写必须填写所有必需字段
- what_changed 控制在 30 字以内
- why_changed 控制在 50 字以内，必须关联到 JD 的具体要求
- 一段经历的 bullet 数量保持与原文相当（原文 3 条 bullet，输出 3-4 条；不要膨胀到 8 条）

【处理流程建议】

1. 先读 JD，识别核心要求和关键词
2. 再读原文，理解用户实际做了什么
3. 对每一条原文 bullet：
   - 判断与 JD 的相关度
   - 决定是否改写
   - 改写时确定信息来源等级
4. 最后判断：是否有 JD 强烈需要、但原文完全没有的能力？
   - 如果有，且原文上下文暗示用户可能有 → 添加一条 red bullet（最多 1 条）
   - 如果没有合理依据 → 不要添加

记住：你不是简历写手，你是诚实的优化顾问。你的价值是让用户的真实经历被准确地表达，而不是让用户看起来像另一个人。
```

### 4.5 Few-shot Examples

#### Example 1：典型金融实习（green 为主）

**输入**：

```
原段落：
- 类型：工作经历
- 标题：国元证券 行业研究实习生
- 内容：参与汽车行业研究，撰写研究报告，对汽车板块进行投资分析。

JD 信息：
- 核心要求：独立完成行业研究、撰写深度报告、覆盖新能源板块
- 关键词：行业研究、新能源、投资分析、研究报告、独立负责
```

**输出**：

```json
{
  "bullets": [
    {
      "rewritten_text": "独立负责新能源汽车板块行业研究，跟踪产业链上下游动态",
      "original_text": "参与汽车行业研究",
      "source_level": "yellow",
      "what_changed": "增加'独立负责'和'新能源'细化",
      "why_changed": "JD 要求独立完成新能源板块研究；'独立负责'需用户确认",
      "matched_jd_phrases": ["新能源", "行业研究", "独立负责"]
    },
    {
      "rewritten_text": "撰写新能源汽车行业研究报告，输出投资分析观点",
      "original_text": "撰写研究报告，对汽车板块进行投资分析",
      "source_level": "green",
      "what_changed": "合并并对齐 JD 术语",
      "why_changed": "JD 强调研究报告 + 投资分析，原文已具备",
      "matched_jd_phrases": ["研究报告", "投资分析"]
    }
  ]
}
```

#### Example 2：技能项改写（保留 JD 原词）

**输入**：

```
原段落：
- 类型：技能
- 标题：技能特长
- 内容：会用数据库，熟悉 Python，做过数据分析

JD 信息：
- 核心要求：熟练 SQL、Python 数据处理、业务数据分析
- 关键词：SQL、Python、Pandas、数据分析、业务洞察
```

**输出**：

```json
{
  "bullets": [
    {
      "rewritten_text": "熟练使用 SQL 进行业务数据查询与分析",
      "original_text": "会用数据库",
      "source_level": "yellow",
      "what_changed": "'数据库' 具体化为 'SQL'",
      "why_changed": "JD 明确要求 SQL，原文'数据库'合理推断包含 SQL",
      "matched_jd_phrases": ["SQL", "数据分析"]
    },
    {
      "rewritten_text": "熟悉 Python 数据处理（Pandas、NumPy）",
      "original_text": "熟悉 Python",
      "source_level": "yellow",
      "what_changed": "补充常用库 Pandas、NumPy",
      "why_changed": "JD 要求 Python 数据处理，需要 Pandas 加分",
      "matched_jd_phrases": ["Python", "Pandas"]
    },
    {
      "rewritten_text": "具备业务数据分析能力，能从数据中提炼洞察",
      "original_text": "做过数据分析",
      "source_level": "green",
      "what_changed": "扩展为业务洞察方向",
      "why_changed": "JD 强调业务洞察，原文已具备数据分析基础",
      "matched_jd_phrases": ["业务数据分析", "数据"]
    }
  ]
}
```

#### Example 3：包含红色缺失补充

**输入**：

```
原段落：
- 类型：工作经历
- 标题：HSBC 证券服务实习生
- 内容：协助处理基金 NAV 计算，参与流程自动化项目，使用 Excel 和 VBA。

JD 信息：
- 核心要求：跨部门协作、向客户汇报、英文工作环境、流程优化
- 关键词：跨部门、客户沟通、英文、流程优化、自动化
```

**输出**：

```json
{
  "bullets": [
    {
      "rewritten_text": "协助完成多支基金的每日 NAV 计算与核查",
      "original_text": "协助处理基金 NAV 计算",
      "source_level": "green",
      "what_changed": "补充'每日'和'核查'细化工作内容",
      "why_changed": "对齐 JD 对细致工作的隐含要求",
      "matched_jd_phrases": ["核查"]
    },
    {
      "rewritten_text": "参与流程自动化项目，使用 VBA 优化重复操作环节",
      "original_text": "参与流程自动化项目，使用 Excel 和 VBA",
      "source_level": "green",
      "what_changed": "改写为'优化重复操作环节'强化价值",
      "why_changed": "JD 强调流程优化，原文已是流程自动化",
      "matched_jd_phrases": ["流程优化", "自动化"]
    },
    {
      "rewritten_text": "在英文工作环境中与多部门同事协作完成项目交付",
      "original_text": "",
      "source_level": "red",
      "what_changed": "新增跨部门协作经历的表达",
      "why_changed": "JD 强调跨部门协作和英文环境，HSBC 工作合理推测具备",
      "matched_jd_phrases": ["跨部门", "英文", "协作"]
    }
  ]
}

#### Example 4：轻微优化应标 green（纠正 yellow 泛滥）

**输入**：

原段落：
- 类型：工作经历
- 标题：某券商 研究实习生
- 内容：撰写研究报告，对汽车板块进行投资分析。

JD 信息：
- 核心要求：撰写研究报告、投资分析
- 关键词：研究报告、投资分析

**输出**：

{
  "bullets": [
    {
      "rewritten_text": "撰写行业研究报告，输出投资分析观点",
      "original_text": "撰写研究报告，对汽车板块进行投资分析",
      "source_level": "green",
      "what_changed": "调整语序，加强动词表达",
      "why_changed": "JD 要求研究报告+投资分析，原文已完全具备，仅优化表达",
      "matched_jd_phrases": ["研究报告", "投资分析"]
    }
  ]
}

**说明**：原文已包含"研究报告""投资分析"两个能力，改写只是语序和动词优化，没有新增任何事实，因此是 green。不要因为"动了字"就标 yellow——只要没引入新信息，就是 green。

#### Example 5：术语对齐应标 green（常见错标为 yellow）

输入：原文"做过数据分析"，JD 关键词"业务数据分析"

❌ 常见错误：标成 yellow，理由"补充了业务属性"
✅ 正确：标成 green

输出：
{
  "rewritten_text": "具备业务数据分析能力",
  "original_text": "做过数据分析",
  "source_level": "green",
  "what_changed": "对齐 JD 用词",
  "why_changed": "'数据分析'与'业务数据分析'是同一能力的不同说法，仅术语对齐",
  "matched_jd_phrases": ["数据分析", "业务"]
}

说明：把通用词换成 JD 的对应词，是术语对齐，不是引入新事实。
这种情况标 yellow 是过度谨慎，会导致用户被无意义的确认淹没。
```

**说明**：第 3 条是 red，因为原文完全没提，但 HSBC 这个公司的属性强烈暗示用户应该有。前端会强制弹出确认弹窗。

### 4.6 失败案例预案

| 失败模式 | 症状 | 处理 |
|---------|------|------|
| AI 完全不输出 red | 所有 bullet 都是 green/yellow | 不强制，red 是 nice-to-have |
| AI 把 red 标得太多 | 超过 30% 是 red | 前端后处理，只保留前 30% |
| AI 仍然编造数字 | 凭空出现"3 个项目""50% 提升" | 正则检测 + 改为模糊量词 |
| JSON 格式错误 | 缺字段或类型错误 | retry 1 次，失败降级 |
| 改写质量整体偏弱 | 用户觉得不如自己写 | 增加 examples 数量到 5-8 个 |

---

## 5. Prompt #2 内容相关性评估

### 5.1 目的

针对完整母版，评估每段经历对当前 JD 的相关性，输出 🟢🟡🔴 三色标签，作为"取舍建议"。

### 5.2 输入数据结构

```typescript
interface RelevanceInput {
  segments: Array<{
    id: string;
    type: string;
    title: string;
    content: string;
    bullets?: string[];
  }>;
  job_description: {
    raw_text: string;
    extracted_keywords: {
      hard_skills: string[];
      title_function: string[];
      business_context: string[];
    };
  };
}
```

### 5.3 输出 JSON Schema

```json
{
  "type": "object",
  "required": ["evaluations"],
  "properties": {
    "evaluations": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["segment_id", "relevance", "reason", "suggested_action"],
        "properties": {
          "segment_id": { "type": "string" },
          "relevance": {
            "type": "string",
            "enum": ["high", "medium", "low"]
          },
          "reason": {
            "type": "string",
            "description": "为什么是这个相关度，不超过 40 字"
          },
          "suggested_action": {
            "type": "string",
            "enum": ["keep_and_optimize", "keep_simplified", "hide_in_this_version"]
          },
          "transferable_value": {
            "type": "string",
            "description": "如果是低相关，说明可迁移的价值（如果有）"
          }
        }
      }
    }
  }
}
```

### 5.4 System Prompt 全文

```
你是一名简历策略顾问，专精于"针对岗位的内容取舍"。

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
- low 类必须填 transferable_value（如果完全没有可迁移价值，写"本次投递可隐藏"）
```

### 5.5 Few-shot Example

Example 1：
**输入**：用户母版含 5 段经历，投递"字节跳动 AI 产品经理"

**输出**：

```json
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
      "segment_id": "seg_2",
      "relevance": "high",
      "reason": "EMLYON 量化金融硕士，量化与数据基础对接 AI PM 价值高",
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

#### Example 2：必须敢标 low（对抗讨好倾向）

**背景**：用户投递"字节跳动 AI 产品经理"，母版中有一段大学社团经历。

**输入**：
segment_id: seg_x
类型：课外活动
标题：校学生会文艺部 部员
内容：参与组织校园歌手大赛，负责活动现场布置和签到。

**❌ 错误输出（讨好用户，硬抬相关度）**：
{
  "segment_id": "seg_x",
  "relevance": "medium",
  "reason": "活动组织体现项目协调能力，可迁移到产品工作",
  "suggested_action": "keep_simplified",
  "transferable_value": "项目协调能力"
}
错误原因：现场布置、签到与 AI 产品经理的核心能力几乎无关，硬抬成 medium 是在讨好用户。

**✅ 正确输出**：
{
  "segment_id": "seg_x",
  "relevance": "low",
  "reason": "活动现场执行与 AI 产品岗位核心能力无直接关联，本次投递不相关",
  "suggested_action": "hide_in_this_version",
  "transferable_value": "本次投递可隐藏；如需体现，仅保留'组织协调'一项软能力"
}

**说明**：诚实评估优先。真不相关就标 low，不要因为"用户花了时间"而抬高。low 不代表"没用"，只代表"本次投递不相关"，母版永远保留。

#### Example 3：教育经历不要轻易标 low（对抗误判）

**输入**：
segment_id: seg_edu
类型：教育背景
标题：EMLYON 量化金融硕士 2023-2025
内容：量化金融与市场金融方向。

JD：字节跳动 AI 产品经理（强调技术理解、数据能力）

**✅ 正确输出**：
{
  "segment_id": "seg_edu",
  "relevance": "high",
  "reason": "量化背景体现数据敏感度与逻辑分析能力，是 AI PM 的加分项",
  "suggested_action": "keep_and_optimize",
  "transferable_value": ""
}

**说明**：教育经历通常标 high，除非专业完全不相关且工作经验已极丰富。不要因为"不是计算机专业"就把硕士学历标 low。
```

### 5.6 失败案例预案

| 失败模式 | 处理 |
|---------|------|
| AI 不敢标 low（讨好用户） | Prompt 已强调"诚实评估"，测试中重点验证 |
| 教育经历被误判为 low | Prompt 已加"谨慎处理教育经历"原则 |
| 所有段落都标 high | 输出有限制：medium 至少占 30%，否则降级评估 |

---

## 6. Prompt #3 差距分析

### 6.1 目的

输出两类差距（表达性 vs 实质性），明确告诉用户"哪些能改、哪些改不了"。

### 6.2 输入数据结构

同 #2（母版 segments + JD）

### 6.3 输出 JSON Schema

```json
{
  "type": "object",
  "required": ["expression_gaps", "substantive_gaps", "overall_judgment"],
  "properties": {
    "expression_gaps": {
      "type": "array",
      "description": "表达性差距：用户有能力但没写出来",
      "items": {
        "type": "object",
        "required": ["jd_requirement", "user_has_evidence", "where_to_add"],
        "properties": {
          "jd_requirement": { "type": "string" },
          "user_has_evidence": { "type": "string" },
          "where_to_add": { "type": "string" }
        }
      }
    },
    "substantive_gaps": {
      "type": "array",
      "description": "实质性差距：用户真的缺这个能力",
      "items": {
        "type": "object",
        "required": ["jd_requirement", "severity", "interview_strategy"],
        "properties": {
          "jd_requirement": { "type": "string" },
          "severity": {
            "type": "string",
            "enum": ["hard_filter", "important", "nice_to_have"]
          },
          "interview_strategy": {
            "type": "string",
            "description": "面试中如何应对，不超过 60 字"
          }
        }
      }
    },
    "overall_judgment": {
      "type": "string",
      "enum": ["recommended", "improve_first", "skip"]
    }
  }
}
```

### 6.4 System Prompt 全文

```
你是一名诚实的求职策略顾问，专精于"识别简历能解决的差距 vs 简历改不掉的差距"。

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
- overall_judgment 必须给出，不能留空
```

### 6.5 Few-shot Example

Example 1
**输入**：用户母版 + 字节跳动 AI PM JD

**输出**：

```json
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

#### Example 2：不要把实质性差距伪装成表达性差距（核心红线）

**背景**：用户是金融转 AI PM，无互联网产品经验。JD 要求"3 年以上互联网产品经验"。

**❌ 错误输出（把硬差距塞进表达性差距来安慰用户）**：
{
  "expression_gaps": [
    {
      "jd_requirement": "3 年以上互联网产品经验",
      "user_has_evidence": "金融工作中有产品化思维",
      "where_to_add": "工作经历段落，强调产品思维"
    }
  ],
  "substantive_gaps": [],
  "overall_judgment": "recommended"
}
错误原因：用户根本没有互联网产品经验，这是改写无法解决的实质性差距，却被塞进"改写就能补"的 expression_gaps，并给出虚假乐观的 recommended。

**✅ 正确输出**：
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

**说明**：判定铁律——用户经历里【真的没有】的能力，必须进 substantive_gaps，不能进 expression_gaps。只有"用户实际具备、但简历没写出来"的，才是表达性差距。混淆两者会误导用户投递不该投的岗位。
```

### 6.6 失败案例预案

| 失败模式 | 处理 |
|---------|------|
| AI 把实质性说成表达性 | Prompt 反复强调"诚实优先"，测试时重点验证 |
| 应对策略写得太空 | Prompt 给了具体示例，要求"可操作" |
| overall_judgment 全是 recommended | 边界规则明确，验证时检查严重程度 |

---

## 7. Prompt #4 简历类型识别

### 7.1 目的

识别用户上传的简历是 A 类（完整母版）、B 类（已精简的投递版）、还是 C 类（半成品/应届生）。

### 7.2 输入数据结构

```typescript
interface ResumeTypeInput {
  word_count: number;
  segment_count: number;
  segments_summary: Array<{
    type: string;
    bullet_count: number;
    has_time_range: boolean;
  }>;
  has_basic_info: boolean;
  text_sample: string;  // 简历的前 500 字作为样本
}
```

### 7.3 输出 JSON Schema

```json
{
  "type": "object",
  "required": ["resume_type", "confidence", "signals", "follow_up_action"],
  "properties": {
    "resume_type": {
      "type": "string",
      "enum": ["A_master", "B_compiled", "C_incomplete"]
    },
    "confidence": {
      "type": "string",
      "enum": ["high", "medium", "low"]
    },
    "signals": {
      "type": "array",
      "items": { "type": "string" }
    },
    "follow_up_action": {
      "type": "string",
      "enum": [
        "direct_to_jd_input",
        "suggest_supplement_master",
        "enter_reverse_guidance"
      ]
    }
  }
}
```

### 7.4 System Prompt 全文

```
你是一名简历状态识别专家。

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
- follow_up_action 必须给出
```

### 7.5 Few-shot Example

**输入**：

```
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
```

**输出**：

```json
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
}
```

### 7.6 失败案例预案

| 失败模式 | 处理 |
|---------|------|
| 极简风格 A 类被判 B/C | UI 允许用户手动切换"我其实是 A 类" |
| 内容很多但都不相关 → 判 A 类 | A 类不代表"质量高"，仅代表完整度 |
| confidence 总是 high | Prompt 已强调"宁可保守"，监控边界 |

---

## 8. Prompt #5 应届生 JD 驱动提问

### 8.1 目的

针对应届生（C 类用户）+ 用户提供的目标 JD，生成具体的、带例子的、降门槛的引导问题。

### 8.2 输入数据结构

```typescript
interface QuestioningInput {
  job_description: {
    raw_text: string;
    extracted_keywords: {
      hard_skills: string[];
      title_function: string[];
      business_context: string[];
    };
    requirements: string[];
  };
  user_info?: {
    major?: string;
    grade?: string;  // 大几 / 应届
    school_tier?: string;
  };
}
```

### 8.3 输出 JSON Schema

```json
{
  "type": "object",
  "required": ["questions"],
  "properties": {
    "questions": {
      "type": "array",
      "minItems": 5,
      "maxItems": 8,
      "items": {
        "type": "object",
        "required": ["topic", "question", "examples", "skip_allowed"],
        "properties": {
          "topic": {
            "type": "string",
            "description": "对应的 JD 能力点（用 JD 原词）"
          },
          "question": {
            "type": "string",
            "description": "具体提问，不超过 50 字"
          },
          "examples": {
            "type": "array",
            "minItems": 4,
            "maxItems": 5,
            "items": { "type": "string" },
            "description": "每个例子不超过 20 字"
          },
          "skip_allowed": {
            "type": "boolean"
          }
        }
      }
    }
  }
}
```

### 8.4 System Prompt 全文

```
你是一名专门帮助应届生挖掘自身经历的求职顾问。

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
2. 从中选 5-8 个**应届生可能有相关经历**的能力点
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
- topic 字段用 JD 原词（如果 JD 写"用户研究"，用"用户研究"，不要改成"用户调研"）
```

### 8.5 Few-shot Example

**输入**：JD 是字节跳动产品经理，要求"产品思维、数据分析、用户洞察、跨部门协作"

**输出**：

```json
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
}
```

### 8.6 失败案例预案

| 失败模式 | 处理 |
|---------|------|
| 例子过于职场化 | Prompt 已明确"贴近大学生生活" + 场景库 |
| 问题数量过多 | Schema 强制 maxItems: 8 |
| 问题超过 50 字 | Prompt 约束 + 前端可截断 |

---

## 9. Prompt #6 STAR 格式转换

### 9.1 目的

把用户口语化的回答自动转换为 STAR 格式的简历 bullet。

### 9.2 输入数据结构

```typescript
interface StarConversionInput {
  user_answer: string;  // 用户的口语化回答
  related_jd_requirement: string;  // 这条回答对应的 JD 能力点
  topic: string;  // 主题（用 JD 原词）
}
```

### 9.3 输出 JSON Schema

```json
{
  "type": "object",
  "required": ["star_bullet", "source_level", "extracted_elements"],
  "properties": {
    "star_bullet": {
      "type": "string",
      "description": "STAR 格式的最终 bullet，不超过 60 字"
    },
    "source_level": {
      "type": "string",
      "enum": ["green", "yellow", "red"]
    },
    "extracted_elements": {
      "type": "object",
      "required": ["situation", "task", "action", "result"],
      "properties": {
        "situation": { "type": "string" },
        "task": { "type": "string" },
        "action": { "type": "string" },
        "result": { "type": "string" }
      }
    },
    "missing_elements": {
      "type": "array",
      "items": { "type": "string" },
      "description": "用户没说清楚的 STAR 元素，前端可提示补充"
    }
  }
}
```

### 9.4 System Prompt 全文

```
你是一名 STAR 格式转换专家，专门把口语化的应届生描述转换为专业的简历 bullet。

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
- 如果某个元素用户没说，对应字段写"未明确"
```

### 9.5 Few-shot Example

**输入**：

```
user_answer: "大三时帮辅导员统计了班级两年的奖学金数据，用 Excel 算了平均分和及格率，做了个表给辅导员。"
related_jd_requirement: "数据分析能力"
topic: "数据分析"
```

**输出**：

```json
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

#### Example 2：克制，不要拔高应届生经历（核心红线）

**输入**：
user_answer: 我在便利店做过收银，有时候客人多就帮忙理货。
related_jd_requirement: 运营管理能力
topic: 运营管理

**❌ 错误输出（严重拔高）**：
{
  "star_bullet": "主导门店运营管理，统筹收银与库存调度，显著提升门店运营效率",
  "source_level": "green",
  "extracted_elements": {
    "situation": "便利店运营管理",
    "task": "统筹收银与库存",
    "action": "优化运营流程",
    "result": "提升运营效率"
  },
  "missing_elements": []
}
错误原因：把"收银+帮忙理货"吹成"主导运营管理、统筹调度、提升效率"——用户从没主导过运营，也没有效率数据。这是编造身份和成果。

**✅ 正确输出**：
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

**说明**：STAR 转换是"提升表达"，不是"提升经历"。用户做的是收银和理货，就如实写收银和理货，只升级表达（"做收银"→"负责收银结算"），不升级角色（不准写"主导运营"）。result 用户没说就标"未明确"，列进 missing_elements，不要编造成果。
```

### 9.6 失败案例预案

| 失败模式 | 处理 |
|---------|------|
| 拔高应届生经历 | Prompt 反复强调"保留事实，提升表达" |
| 凭空捏造数字 | Prompt 明确"用户没说的不要造" |
| 输出太长 | Schema 约束 + 前端截断 |

---

## 10. 测试与评估

### 10.1 测试用例

#### 用例 1：典型 A 类用户

- **场景**：工作 3 年想跳槽的产品经理
- **测试简历**：完整简历，1800 字，6 段经历
- **测试 JD**：互联网大厂产品经理岗
- **应触发**：#4（识别为 A）→ #1 + #2 + #3 并行
- **关注点**：改写质量、相关度判定、差距分析准确性

#### 用例 2：典型 B 类用户

- **场景**：上传了已精简的投递版简历
- **测试简历**：1 页简洁版，900 字
- **测试 JD**：换行业的目标岗
- **应触发**：#4（识别为 B）→ 提示补充 → #1 + #2 + #3
- **关注点**：是否准确识别为 B、补充建议是否合理

#### 用例 3：典型 C 类用户

- **场景**：应届生第一次写简历
- **测试简历**：300 字，只有教育和一段实习
- **测试 JD**：互联网公司管培生岗
- **应触发**：#4（识别为 C）→ #5（提问） → 用户回答 → #6 × N → #1 + #2 + #3
- **关注点**：问题是否针对性强、STAR 转换是否拔高

#### 用例 4：边界用例 - 跨行业转型

- **场景**：金融背景转 AI PM
- **测试简历**：金融背景母版
- **测试 JD**：AI 产品经理岗
- **关注点**：差距分析能否识别核心硬差距、可迁移价值评估

#### 用例 5：边界用例 - 极简风格 A 类

- **场景**：经验丰富但简历写得极简的高级别用户
- **测试简历**：仅 800 字但每段都精到
- **关注点**：是否被误判为 B / C 类

### 10.2 评估指标

#### 自动化指标（可量化）

| 指标 | 目标值 | 测量方法 |
|------|-------|---------|
| JSON Schema 通过率 | 100% | 自动 schema validation |
| Red 类比例 | ≤ 30% | 统计输出中 red 占比 |
| 数字编造率 | 0% | 正则检测原文未出现的数字 |
| 同义改写率 | < 5% | 检测 JD 关键词是否被换掉 |
| 平均响应时间 | < 5 秒 | API 调用计时 |

#### 人工评估指标（需主观判断）

| 指标 | 评估方法 | 通过标准 |
|------|---------|---------|
| 改写质量 | 5 人盲测打分（1-5 分） | 平均 ≥ 4.0 |
| 信息来源标注准确性 | 人工抽样检查 | ≥ 90% 准确 |
| 差距分析合理性 | 求职专家审核 | ≥ 80% 认可 |
| 应届生问题接受度 | 应届生用户测试 | ≥ 80% 觉得"想得起来" |
| 整体可信度 | 招聘者审核简历 | ≥ 70% 觉得"看起来真实" |

### 10.3 红线测试（必须 100% 通过）

这些是不能违反的底线，测试中任何一次失败都需要立刻修复 Prompt：

1. **绝不编造经历**：用户简历完全没提的事，AI 不能在 green 或 yellow 中出现
2. **绝不修改 JD 必备词**：JD 明确要求"SQL"，不能改成"数据库技术"
3. **绝不把硬差距说成软差距**：JD 写"5 年经验"，用户 2 年，必须标 hard_filter
4. **绝不输出无效 JSON**：100% 符合 schema

### 10.4 测试流程建议

**Phase 1：单 Prompt 测试**

每个 Prompt 单独跑 5-10 次，用不同的测试数据。
通过标准：JSON 通过率 100%、关键约束零违反。

**Phase 2：端到端测试**

跑完整的用户流程（上传 → 分析 → 改写 → 导出）。
通过标准：流程无阻塞、AI 输出无矛盾。

**Phase 3：真实用户测试**

找 5-10 个真实用户使用产品。
通过标准：满意度 ≥ 4.0，无重大反馈。

---

## 11. 常见问题与失败案例处理

### 11.1 AI 输出质量问题

**问题 1：改写后用户认不出原文**

- **原因**：AI 改写幅度过大
- **处理**：在 System Prompt 中强化"用户能认出原句的影子"
- **临时方案**：前端展示 diff 视图，让用户对比

**问题 2：所有改写都被标为 yellow**

- **原因**：AI 过度谨慎
- **处理**：增加 Example 中 green 的比例
- **目标分布**：green 60-70%，yellow 20-30%，red < 10%

**问题 3：red 标注泛滥**

- **原因**：AI 激进
- **处理**：Schema 中加约束（前端后处理时检查比例）
- **强制规则**：red 不超过 30%，超出时按 confidence 排序保留

### 11.2 工程问题

**问题 4：JSON 输出格式错误**

- **理论上不会发生**：Gemini 2.0+ 的 responseJsonSchema 保证格式
- **保险方案**：仍然做 schema validation，失败时 retry 1 次

**问题 5：响应超时**

- **常见原因**：JD 太长 + 母版太大
- **处理**：限制输入 token 数，超过截断
- **降级**：超时则用兜底回复，不阻塞用户

**问题 6：API 配额限制**

- **处理**：实现简单的请求队列 + 缓存
- **缓存策略**：相同输入 24 小时内复用结果

### 11.3 用户体验问题

**问题 7：用户不理解信息来源等级**

- **处理**：UI 上每个颜色标签都有 tooltip 解释
- **文案**：使用"基于你原简历 / AI 推测 / 需要你确认"等大白话

**问题 8：用户觉得 AI 改得不好**

- **处理**：提供"编辑"按钮，让用户在 AI 改写基础上自己调整
- **不是**：让用户从头写

**问题 9：应届生不知道怎么回答 #5 的问题**

- **处理**：每个问题的 examples 字段降低门槛
- **保底**：所有问题 skip_allowed = true

---

## 附录 A：Prompt 设计的开源借鉴来源

| 设计元素 | 借鉴来源 |
|---------|---------|
| Minimal Edits 原则 | Resume-Tailor-AI (JaimeYeung/Resume-Tailor-AI) |
| No Hallucinations Policy | Resume-Tailor-Agents (Soroush-aali-bagi/resume-tailor-agents) |
| 保留 JD 原词原则 | Resume-Matcher (srbhr/Resume-Matcher) |
| 关键词分类（Hard Skills / Title / Context） | Resume-Tailor-AI |
| Hard Filter 概念 | Resume-Tailor-AI |
| Few-shot Examples 风格 | resumejob/awesome-resume |
| 信息来源三级标注 | 自创（差异化护城河） |
| 应届生 JD 驱动提问 | 自创（差异化护城河） |
| STAR 格式 + 信息来源标注 | 自创（差异化护城河） |

---

## 附录 B：迭代日志

| 版本 | 日期 | 变更 |
|------|------|------|
| v1.0 | 初版 | 6 个 Prompt 完整设计，含 Schema、Examples、失败案例 |

**预期后续迭代点**：

1. 真实用户测试后，根据反馈调整 Few-shot Examples
2. 根据高频失败模式，增强约束规则
3. 根据 Token 消耗，可能合并/拆分某些 Prompt
4. 加入更多边界用例的测试

---

**文档结束**

> 维护提示：每次修改任何 Prompt，记得更新 v 版本号，并在附录 B 中记录变更。
