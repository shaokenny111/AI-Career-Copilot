# AI Resume Compiler（投递助手 V2.0）

> 把简历当作**可编译的资产**：维护一份永不被改动的母版，针对每个岗位（JD）编译出独立子版——编译过程由 AI 做"取舍 + 改写 + 差距分析"，但**绝不替你造假**。

**English summary.** AI Resume Compiler treats your résumé as a *compilable asset*. You keep one immutable **master** (the complete, truthful record of everything you've done); for each job description the app **compiles** a tailored **version** of it. An LLM decides what to keep, rewrites bullets to align with the JD, and analyzes gaps — but it is built around a hard **honesty constraint**: it will not inflate your experience or fabricate achievements. Anything the AI can't ground in your real material is surfaced as an explicit *gap* (with interview-handling and skill-building advice), never disguised as an adoptable bullet. Every rewritten line carries a **source-of-truth label** (🟢 from your text / 🟡 AI inference / 🔴 AI supplement, requires your confirmation). The match score is a deterministic weighted hit-rate, not an AI guess.

---

## 这个产品的灵魂：诚实

许多 AI 简历工具倾向于美化、拔高经历来提升匹配分。这个产品做了相反的选择——**宁可如实指出差距，也不替用户造假**。它会诚实地告诉你"这条你没有，别装，去补"。

诚实不是一句口号，是贯穿全链路的硬约束：

- **不替用户造假。** AI 编不出真实依据的内容时，不会伪装成一条可采纳的假 bullet 塞给你；而是如实进入**差距列表**，配上「面试如何诚实应对」+「能力如何补齐」的建议。差距是用来面对的，不是用来藏的。
- **不拔高经历。** 引导应届生时，"便利店收银"不会被 AI 写成"主导门店运营"。弱经历就如实写成弱经历，模糊的数量用 `X+` 占位而非编造具体数字。
- **评分诚实，不虚高。** 简历里没有的硬门槛（比如 JD 要求"5 年经验"而简历只有 2 年），永久不命中、分数封顶——不会因为"措辞改一改"就假装满足。
- **来源透明。** 每条改写都带三色标注，你一眼能分清哪些是你自己的真事实、哪些是 AI 的发挥。

---

## 三个核心差异化

### 1. 母版 / 子版的"编译"心智
简历不是一份会被反复覆盖、越改越乱的 Word 文档，而是**可编译的资产**：

- **母版（Master）** = 你做过的所有事的完整、真实记录，**永不被编译改动**。
- **子版（CompiledVersion）** = 针对某个具体 JD，从母版"编译"出的取舍后版本。

针对 10 个岗位投递，就编译出 10 个子版，各自独立、各自带匹配度，母版始终完好。

### 2. 三色信息来源标注
每条 bullet 都标明它的可信度来源：

| 标注 | 含义 | 是否需确认 |
|------|------|-----------|
| 🟢 **直接来源** | 直接来自你母版的原文 | 默认采纳 |
| 🟡 **AI 推断** | 基于原文线索的合理对齐（上位词→JD 下位词的字面具体化） | 默认采纳 |
| 🔴 **AI 补充** | AI 凭 JD 推断、原文没有明说的内容 | **必须你主动确认才写入** |

红色是诚实的最后一道闸：AI 想替你补的东西，**得你点头**才算数，绝不默认采纳。

### 3. 评分是确定性的，不是 AI 拍脑袋
匹配度分数（0–100）**绝不让 AI 直接打分**（AI 打分会漂移、不可解释）。它是一个**确定性加权命中率**：每条 JD 要求按重要度加权（硬门槛 2× / 头衔相关 1.5× / 上下文 1×），命中多少算多少。

---

## 关键产品 / 技术决策

> 这部分体现的是对 **AI 能力边界**的判断——哪些交给 LLM、哪些绝不能。

### 决策一：AI 做语义判断，确定性算法做计算（分工铁律）
评分链路严格分两层：

- **编译期（用 AI）**：`#8 parseJd` 只看 JD、绝不看简历，抽出全部要求清单（看简历会漏报简历没覆盖的要求、破坏诚实天花板）；`#9 matchRequirements` 在编译期做**跨语言语义判定**——中文 bullet 能不能满足英文 JD 要求，由 AI 一次性建好映射。
- **运行期（纯确定性）**：用户在工作台采纳/拒绝 bullet 时，分数只做加权求和，**运行期绝不再跑 AI**。

→ 把"需要语义理解的判断"和"需要可复现的计算"彻底分开。判断可以模糊，但**计算必须每次一样**。

### 决策二：诚实且稳健地处理 LLM 的能力边界，不把分数包装成精确值
LLM 语义评分存在固有不确定性，无法像传统算法那样保证完全可复现。产品**不假装这个分数是精确的**，而是把不确定性如实暴露、并把用户的注意力引向更稳定的信息：

- UI 同时呈现 **分数 + 四级匹配档位 + 波动提示**，引导用户关注更稳定的**档位**而非精确分。
- 工程上能控的不确定性都尽量收敛：评分相关任务 `temperature=0`；公司名绝不进评分 prompt（曾发现仅公司名中英写法差异就会改变 AI 抽取的要求清单、导致分数漂移，已从源头隔离）。**能控的尽量控，控不了的如实说**——这才是面对 AI 能力边界该有的态度。

### 决策三：从源头堵住"AI 编造 + 一键采纳就涨分"的后门
如果 AI 能凭空生成一条空泛能力句、用户一键采纳就涨分，诚实就破功了。所以治理放在**生成源头**：

- `#1 rewrite` 的红色补充**必须有原文锚点**，凭 JD 反写的空泛能力句（"构建产品愿景""推动竞争分析"——原文根本没有）被**禁止生成**。
- 黄色（AI 推断）也收紧：只允许"原文上位词 → JD 下位词"的字面具体化，**过度延伸成新职责一律不许标黄**。
- 教育 / 技能 / 证书段**豁免改写**：事实原样保留，绝不被 AI 美化成能力句。

---

## 技术栈

| 层 | 选型 |
|----|------|
| 前端 | React 19 · Vite 6 · TypeScript · Tailwind CSS v4 · Motion · lucide-react |
| AI | Google Gemini（9 个任务化 Prompt，各带内联 few-shot + `responseJsonSchema` + zod 二次校验） |
| API 代理 | Cloudflare Pages Functions（`/api/gemini`，保护 API Key 不落前端） |
| 文件解析 | mammoth（Word）· pdfjs-dist（PDF）· Gemini OCR（图片） |
| 导出 | docx（Word）· 浏览器原生 print-to-pdf（中文零字体嵌入）· 逐段/全文复制 |
| 持久化 | localStorage（单 key + schema 版本迁移） |

---

## 本地运行

> ⚠️ **重要**：AI 真链路走 Cloudflare Pages Function（`/api/gemini`）。`vite dev` **不执行** Function，所以 `pnpm dev` 能跑 UI，但**所有 Gemini 调用会失败**。要跑通真链路必须用 wrangler。

**1. 安装依赖**（推荐 pnpm，仓库带 `pnpm-lock.yaml`；npm 亦可）
```bash
pnpm install
```

**2A. 只看 UI（不调 AI）**
```bash
pnpm dev
```

**2B. 跑通 AI 真链路（推荐）**

在项目根新建 `.dev.vars`，写入你的 Gemini API Key：
```
GEMINI_API_KEY=你的key
```
然后构建 + 用 Cloudflare wrangler 本地起 Pages（会真正执行 `/api/gemini` 代理）：
```bash
pnpm build
npx wrangler pages dev dist
```

> 部署到 Cloudflare Pages 时，在项目环境变量里配置同名的 `GEMINI_API_KEY` 即可。

---

## 文档

- `docs/AI_Resume_Compiler_产品说明书.md` — 产品设计
- `docs/AI_Resume_Compiler_Prompt系统设计.md` — 9 个 Prompt 任务的设计与评分算法（事实源）
