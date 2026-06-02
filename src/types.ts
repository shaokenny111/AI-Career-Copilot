// ============================================================================
// AI Resume Compiler · 数据结构定义（types.ts）
// ============================================================================
// 项目: AI Resume Compiler (V2.0)
// 作用: 整个项目的"数据宪法"——所有组件、AI 调用、本地存储都遵循此契约
// 维护原则:
//   1. 凡涉及 AI 输入的字段，遵循《Prompt系统设计》2.4 节"输入数据契约"
//   2. 字段一旦上线后改动会引发连锁重构，新增字段优于修改字段
//   3. 任何新组件/新功能写代码前先看本文件，不要绕过类型定义
// ============================================================================


// ============================================================================
// 一、基础枚举类型
// ============================================================================

/** 简历段落的类型 */
export type SegmentType =
  | "work"          // 工作经历
  | "internship"    // 实习经历
  | "project"       // 项目经历
  | "education"     // 教育背景
  | "skill"         // 技能特长
  | "certificate"   // 证书
  | "award"         // 获奖
  | "activity"      // 课外活动 / 社团
  | "other";        // 其他

/** 用户简历类型（由 Prompt #4 判定） */
export type ResumeType =
  | "A_master"      // 完整母版（成熟职场人）
  | "B_compiled"    // 已精简的投递版
  | "C_incomplete"; // 半成品/应届生

/** AI 判断的置信度 */
export type Confidence = "high" | "medium" | "low";

/** 信息来源等级（核心差异化机制） */
export type SourceLevel =
  | "green"   // 🟢 直接来源：基于原文事实，仅做表达优化
  | "yellow"  // 🟡 推断信息：原文有字面线索，AI 做合理延伸
  | "red";    // 🔴 缺失补充：原文完全没有，靠 JD 推断，需用户主动确认

/** 内容相关性评估（Prompt #2 输出） */
export type Relevance = "high" | "medium" | "low";

/** JD 要求的权重档（Prompt #8 输出；文档 2.6 的 Hard / Title / Context）
 *  - hard：硬性门槛（学历/年限/必备证书或硬技能），达不到通常直接被刷 → 2x
 *  - title：与职位职责直接对应的核心能力（这份工作"主要在做什么"）→ 1.5x
 *  - context：加分项 / "优先者优先" / 软素质，非必须 → 1x
 *  枚举名故意与文档 2.6 术语一致，看代码 / 看文档不用心理翻译。 */
export type RequirementImportance = "hard" | "title" | "context";

/** 对一段经历的处理建议 */
export type SuggestedAction =
  | "keep_and_optimize"     // 保留并优化
  | "keep_simplified"       // 保留但精简
  | "hide_in_this_version"; // 本次投递隐藏（母版仍保留）

/** 差距严重程度 */
export type GapSeverity =
  | "hard_filter"   // 硬筛条件（如"必须 X 年经验"），可能直接被刷
  | "important"     // 重要但非硬筛
  | "minor";        // 轻微差距

/** 整体投递建议（Prompt #3 输出） */
export type OverallJudgment =
  | "recommended"   // 推荐投递
  | "improve_first" // 改了再投
  | "not_recommended"; // 不建议投


// ============================================================================
// 二、母版数据结构（Master）
// ============================================================================
// 母版 = 用户所有经历的完整集合，永远完整保留，是所有子版的"事实来源"
// ============================================================================

/** 时间范围（强制字段——昨晚测试证实：缺失会导致 AI 脑补工作年限） */
export interface TimeRange {
  start: string;   // 起始日期 YYYY-MM 格式，如 "2025-08"
  end: string;     // 结束日期 YYYY-MM 格式；在职用 "present"
}

/** 一段经历（segment）——母版的最小组成单位 */
export interface Segment {
  /** 唯一 ID（建议格式：seg_<type>_<随机串>） */
  id: string;

  /** 经历类型 */
  type: SegmentType;

  /** 标题（如"国元证券 行业研究实习生"） */
  title: string;

  /** 副标题（如所在城市、项目角色等可选信息） */
  subtitle?: string;

  /** 正文内容——必须是真实完整文本，禁止存摘要 */
  content: string;

  /** 时间范围（强制，缺失会让 AI 误判应届生身份） */
  timeRange: TimeRange;

  /** 是否当前在职（强制，决定该经历能否被建议隐藏） */
  isCurrent: boolean;

  /** 标签（给 AI 判断相关性用，不区分来源） */
  tags: string[];

  /** 创建时间（自动填充） */
  createdAt: string;

  /** 最后修改时间（自动填充） */
  updatedAt: string;
}

/** 个人基本信息 */
export interface BasicInfo {
  name: string;
  email: string;
  phone: string;
  /** 头像 URL 或 base64，可选 */
  avatar?: string;
  /** 个人简介一句话，可选 */
  headline?: string;
  /** 所在城市，可选 */
  location?: string;
  /** 个人链接（GitHub / 个人网站 / LinkedIn 等） */
  links?: Array<{ label: string; url: string }>;
}

/** 母版（用户所有经历的完整集合） */
export interface Master {
  /** 母版唯一 ID（用户只有一份母版） */
  id: string;

  /** 基本信息 */
  basicInfo: BasicInfo;

  /** 所有段落（顺序即简历显示顺序） */
  segments: Segment[];

  /** 母版语言（中文/英文） */
  language: "zh" | "en";

  /** 用户类型（由 Prompt #4 判定，存下来避免重复识别） */
  resumeType: ResumeType;

  /** 创建时间 */
  createdAt: string;

  /** 最后修改时间 */
  updatedAt: string;
}


// ============================================================================
// 三、子版数据结构（Compiled Version）
// ============================================================================
// 子版 = 针对具体 JD 编译出的精简优化版本
// 一个母版可以编译出多个子版（每次投不同岗位生成一个）
// ============================================================================

/** 一条改写的 bullet（Prompt #1 输出的最小单位） */
export interface RewrittenBullet {
  /** 稳定唯一 id（由 Prompt #1 在生成时赋值）。
   *  bullet 的身份锚点——Prompt #9 的"要求↔bullet 映射"靠它引用，
   *  绝不用 (segmentId, index)：顺序一变就错位。 */
  id: string;

  /** 改写后的文本 */
  rewrittenText: string;

  /** 原文文本；如果是 red（凭空补充），此字段为空字符串 */
  originalText: string;

  /** AI 编辑后用户又编辑过的版本——保留 AI 原版用于"还原"和"采纳率统计" */
  userEditedText?: string;

  /** 信息来源等级（决定前端的颜色标注和确认逻辑） */
  sourceLevel: SourceLevel;

  /** AI 做了什么改动（≤30 字） */
  whatChanged: string;

  /** 为什么这样改（≤50 字，必须关联 JD） */
  whyChanged: string;

  /** 命中的 JD 关键词列表 */
  matchedJdPhrases: string[];

  /** 用户对这条 red bullet 的确认状态（仅 red 需要） */
  redConfirmation?: {
    /** 用户是否已确认 */
    confirmed: boolean;
    /** 用户的确认动作：采纳/拒绝/修改后采纳 */
    action: "accept" | "reject" | "modify_and_accept";
    /** 确认时间 */
    confirmedAt: string;
  };
}

/** 子版里对每个母版段落的处理决策 */
export interface SegmentDecision {
  /** 对应母版 segment 的 ID */
  segmentId: string;

  /** 相关性评估（Prompt #2 输出） */
  relevance: Relevance;

  /** 处理建议 */
  suggestedAction: SuggestedAction;

  /** 该段在本子版中是否被采纳（前端规则可能 override AI 建议，
   *  比如：低相关但当前在职 → 自动降级为 keep_simplified） */
  finalIncluded: boolean;

  /** 该段的所有改写 bullet（仅 finalIncluded=true 时有内容） */
  bullets: RewrittenBullet[];

  /** AI 给出的相关性理由 */
  relevanceReason: string;

  /** 可迁移价值描述（仅 low 相关性时使用） */
  transferableValue?: string;
}

/** AI 检测出的差距（Prompt #3 输出） */
export interface Gap {
  /** JD 中的具体要求 */
  jdRequirement: string;
  /** 严重程度 */
  severity: GapSeverity;
  /** 面试时的应对策略 */
  interviewStrategy: string;
}

/** 表达性差距（可以靠改写补上） */
export interface ExpressionGap {
  jdRequirement: string;
  /** 用户已有什么证据 */
  userHasEvidence: string;
  /** 应在哪段补充 */
  whereToAdd: string;
}

/** 完整的差距分析结果 */
export interface GapAnalysis {
  /** 表达性差距（用户实际有，但简历没体现） */
  expressionGaps: ExpressionGap[];

  /** 实质性差距（用户真的没有，改写补不上） */
  substantiveGaps: Gap[];

  /** 整体投递建议 */
  overallJudgment: OverallJudgment;

  /** 整体评分 0-100（综合各维度） */
  overallScore: number;
}

/** 投递标记（明确不做投递追踪，只做最小标记） */
export interface ApplicationMark {
  /** 是否已投递 */
  applied: boolean;
  /** 投递时间（applied=true 时有值） */
  appliedAt?: string;
}

/** 从 JD 提取的一条结构化要求（Prompt #8 输出；id 由 compile 赋值）。
 *  铁律：要求只从 JD 提取，绝不看简历——否则 AI 会少报"简历没覆盖"的要求，
 *  破坏诚实天花板。这些要求是确定性匹配度的【分母全集】。 */
export interface JdRequirement {
  /** 稳定 id（如 req_xxx；compile 生成，供 Prompt #9 映射引用） */
  id: string;
  /** 要求文本（保留 JD 原文措辞与语言） */
  text: string;
  /** 权重档 */
  importance: RequirementImportance;
}

/** 一条 JD 要求 ↔ 命中它的 bullet（Prompt #9 在编译期建立的语义映射）。
 *  分工：编译期 AI 建映射（跨语言语义判定），运行期 scoring 只做确定性加权，
 *  不再跑 AI。 */
export interface RequirementMatch {
  /** 对应 JdRequirement.id */
  requirementId: string;
  /** 命中该要求的 bullet id 列表（RewrittenBullet.id；空数组=暂无 bullet 覆盖） */
  bulletIds: string[];
}

/** JD 信息（用户输入） */
export interface JobDescription {
  /** 公司名称 */
  company: string;
  /** 职位名称 */
  position: string;
  /** JD 原文 */
  rawText: string;
  /** AI 提取的结构化要求（Prompt #8 编译时填充；用户输入态尚无此字段，故可选）。
   *  确定性匹配度的分母来源——含简历未覆盖的要求，构成诚实天花板。 */
  requirements?: JdRequirement[];
  /** AI 提取的核心要求列表 */
  coreRequirements?: string[];
  /** AI 提取的关键词 */
  keywords?: string[];
}

/** 子版（针对一个具体 JD 编译出的简历版本） */
export interface CompiledVersion {
  /** 子版唯一 ID */
  id: string;

  /** 对应的母版 ID */
  masterId: string;

  /** 子版名称（如"字节-AI产品经理-20260601"，便于用户识别） */
  name: string;

  /** 投递的目标 JD */
  jobDescription: JobDescription;

  /** 对每个母版段落的处理决策 */
  segmentDecisions: SegmentDecision[];

  /** Prompt #9 编译期建立的"要求↔bullet"映射。
   *  运行期 scoring 只读它做确定性加权，绝不再跑 AI。 */
  requirementMatches: RequirementMatch[];

  /** 差距分析结果 */
  gapAnalysis: GapAnalysis;

  /** 投递标记 */
  applicationMark: ApplicationMark;

  /** 子版语言（默认跟母版，可手动切换） */
  language: "zh" | "en";

  /** 创建时间 */
  createdAt: string;

  /** 最后修改时间 */
  updatedAt: string;
}


// ============================================================================
// 四、AI 输入输出契约（对应 6 个 Prompt）
// ============================================================================
// 所有 AI 调用的输入输出都在这里定义，gemini.ts 必须严格按这些类型拼装
// ============================================================================

// ---------- Prompt #4：简历类型识别 ----------

/** 简历类型识别的输入摘要（不传完整简历，只传统计特征） */
export interface ResumeTypeInput {
  wordCount: number;
  segmentCount: number;
  segmentsSummary: Array<{
    type: SegmentType;
    bulletCount: number;
    hasTimeRange: boolean;
  }>;
  hasBasicInfo: boolean;
  /** 简历前 500 字样本 */
  textSample: string;
}

export interface ResumeTypeOutput {
  resumeType: ResumeType;
  confidence: Confidence;
  /** 判断依据列表 */
  signals: string[];
  /** 后续动作 */
  followUpAction:
    | "direct_to_jd_input"
    | "suggest_supplement_master"
    | "enter_reverse_guidance";
}

// ---------- Prompt #7：母版解析（纯文本 → 结构化）----------
// 把上传/粘贴得到的简历纯文本切分成 BasicInfo + Segment[]。
// 铁律：每段必须带 timeRange + isCurrent（缺失会让后续 AI 脑补工作年限）。

/** 解析出的单段经历（尚未落盘，缺 id/时间戳，由调用方补全成 Segment） */
export interface ParsedSegment {
  type: SegmentType;
  title: string;
  subtitle?: string;
  /** 正文：必须是原文完整内容，禁止摘要 */
  content: string;
  /** 时间范围（强制；无明确时间的段如技能用空串占位） */
  timeRange: TimeRange;
  /** 是否当前在职/进行中（强制） */
  isCurrent: boolean;
  tags: string[];
}

export interface ResumeParseInput {
  /** 简历纯文本（OCR / Word 提取 / 粘贴所得） */
  rawText: string;
}

export interface ResumeParseOutput {
  basicInfo: BasicInfo;
  segments: ParsedSegment[];
}

// ---------- Prompt #2：内容相关性评估 ----------

export interface RelevanceInput {
  /** 母版所有段落（必须包含 timeRange 和 isCurrent，否则 AI 会脑补） */
  segments: Segment[];
  /** 目标 JD */
  jobDescription: JobDescription;
}

export interface RelevanceOutput {
  evaluations: Array<{
    segmentId: string;
    relevance: Relevance;
    reason: string;
    suggestedAction: SuggestedAction;
    transferableValue?: string;
  }>;
}

// ---------- Prompt #1：段落改写 + 信息来源标注 ----------

export interface RewriteInput {
  /** 要改写的段落 */
  segment: Segment;
  /** 目标 JD */
  jobDescription: JobDescription;
}

export interface RewriteOutput {
  bullets: RewrittenBullet[];
}

// ---------- Prompt #3：差距分析 ----------

export interface GapAnalysisInput {
  /** 母版所有段落（含时间字段，否则 AI 会误判工作年限） */
  segments: Segment[];
  /** 目标 JD */
  jobDescription: JobDescription;
}

export type GapAnalysisOutput = GapAnalysis;

// ---------- Prompt #5：应届生 JD 驱动提问 ----------

export interface GuidanceQuestionsInput {
  jobDescription: JobDescription;
  userInfo: {
    /** 专业 */
    major: string;
    /** 年级（如"应届"、"大四"） */
    grade: string;
  };
}

export interface GuidanceQuestionsOutput {
  questions: Array<{
    /** 对应 JD 的能力点 */
    topic: string;
    /** 问题文本 */
    question: string;
    /** 4-5 个贴近学生生活的例子 */
    examples: string[];
    /** 是否允许跳过 */
    skipAllowed: boolean;
  }>;
}

// ---------- Prompt #8：JD 要求提取（只看 JD，不看简历）----------
// 铁律：输入只有 JD。看简历会让 AI 少报简历没覆盖的要求，破坏诚实天花板。

export interface ParseJdInput {
  jobDescription: JobDescription;
}

export interface ParseJdOutput {
  /** 提取出的要求（无 id；id 由 compile 赋值后成为 JdRequirement） */
  requirements: Array<{
    text: string;
    importance: RequirementImportance;
  }>;
}

// ---------- Prompt #9：要求 ↔ bullet 语义映射（跨语言）----------
// 编译期一次性建立映射；语义 + 跨语言判定（英文要求 ↔ 中文 bullet 也能命中）。

export interface MatchRequirementsInput {
  /** 带 id 的 JD 要求（compile 已赋 id） */
  requirements: JdRequirement[];
  /** 全部已纳入段落的 bullet（id + 文本） */
  bullets: Array<{ id: string; text: string }>;
}

export interface MatchRequirementsOutput {
  matches: RequirementMatch[];
}

// ---------- Prompt #6：STAR 格式转换 ----------

export interface StarConversionInput {
  /** 用户的口语化回答 */
  userAnswer: string;
  /** 该问题对应的 JD 要求 */
  relatedJdRequirement: string;
  /** 主题（如"数据分析"、"运营管理"） */
  topic: string;
}

export interface StarConversionOutput {
  /** 转换后的 bullet */
  starBullet: string;
  /** 信息来源等级 */
  sourceLevel: SourceLevel;
  /** STAR 四要素拆解 */
  extractedElements: {
    situation: string;
    task: string;
    action: string;
    result: string;
  };
  /** 用户没说清的部分（占位符或"未明确"） */
  missingElements: string[];
}


// ============================================================================
// 五、应用状态与本地存储
// ============================================================================

/** Onboarding 状态（渐进式引导，不弹窗、不教程） */
export interface OnboardingState {
  /** 是否完成基础引导 */
  onboardedV1: boolean;
  /** 首次接受 red 改写的时间（用于"用户首次理解信息来源标注"的判定） */
  firstRedAcceptedAt?: string;
  /** 首次完成一次完整编译的时间 */
  firstCompileCompletedAt?: string;
}

/** 整个 App 的本地存储结构（localStorage 的顶层结构） */
export interface AppStorage {
  /** 存储版本号（schema 升级时用） */
  schemaVersion: number;
  /** 母版（用户只有一份） */
  master: Master | null;
  /** 所有子版 */
  compiledVersions: CompiledVersion[];
  /** Onboarding 状态 */
  onboarding: OnboardingState;
  /** UI 偏好（语言、主题等） */
  preferences: {
    uiLanguage: "zh" | "en";
  };
}


// ============================================================================
// 六、辅助工具类型
// ============================================================================

/** 用于"AI 改写采纳率"统计的元数据 */
export interface AcceptanceStats {
  totalBullets: number;
  acceptedBullets: number;    // 用户未修改直接采纳
  modifiedBullets: number;    // 用户修改后采纳
  rejectedBullets: number;    // 用户拒绝（red 拒绝或主动删除）
}

/** 应用全局事件（用于埋点和日志，非必需但建议保留接口） */
export type AppEvent =
  | { type: "master_created"; masterId: string }
  | { type: "compile_started"; masterId: string; jdSnippet: string }
  | { type: "compile_completed"; versionId: string; durationMs: number }
  | { type: "red_confirmed"; versionId: string; bulletId: string; action: "accept" | "reject" }
  | { type: "version_exported"; versionId: string; format: "pdf" | "docx" | "copy" }
  | { type: "version_applied"; versionId: string };
