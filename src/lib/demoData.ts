// ============================================================================
// 演示数据（仅用于 Phase 2 的"预览示例数据"开关，便于在无真实数据时审阅 UI）
// ----------------------------------------------------------------------------
// 临时：真实上传/编译流程接入后（Phase 3+）即可删除本文件与对应预览开关。
// 数据严格按 types.ts 契约构造（segment 均带 timeRange + isCurrent）。
// ============================================================================

import type { AppStorage, CompiledVersion, Master, Segment } from "../types";

const DAY = 86_400_000;
const now = Date.now();
const iso = (offsetDays: number) => new Date(now - offsetDays * DAY).toISOString();

const seg = (
  id: string,
  type: Segment["type"],
  title: string,
  content: string,
  timeRange: Segment["timeRange"],
  isCurrent: boolean,
  tags: string[],
): Segment => ({
  id,
  type,
  title,
  content,
  timeRange,
  isCurrent,
  tags,
  createdAt: iso(120),
  updatedAt: iso(0),
});

export const DEMO_MASTER: Master = {
  id: "master_demo",
  basicInfo: {
    name: "邵子康",
    email: "demo@example.com",
    phone: "13800000000",
    headline: "AI 产品经理 · 金融科技背景",
    location: "上海",
  },
  language: "zh",
  resumeType: "A_master",
  createdAt: iso(120),
  updatedAt: iso(0),
  segments: [
    seg(
      "seg_project_copilot",
      "project",
      "AI Resume Copilot",
      "独立设计并落地一款面向求职者的 AI 简历编译工具，覆盖简历解析、岗位匹配、信息来源标注与改写工作台；负责产品设计、Prompt 系统设计与前端实现，已上线并积累早期用户反馈。",
      { start: "2025-01", end: "present" },
      true,
      ["AI 产品", "0-1 落地", "Prompt 设计"],
    ),
    seg(
      "seg_work_haisheng",
      "work",
      "海晟金融租赁",
      "担任产品经理，负责租赁业务线的数字化系统建设，主导需求梳理与跨部门协作，推动业务流程线上化，参与业务数据分析支持管理层决策。",
      { start: "2022-07", end: "2024-12" },
      false,
      ["产品经理", "跨部门协作", "数据分析"],
    ),
    seg(
      "seg_intern_guoyuan",
      "internship",
      "国元证券",
      "行业研究实习生，参与新能源汽车板块行业研究，撰写行业分析报告，跟踪产业链上下游动态并输出投资分析观点。",
      { start: "2021-06", end: "2021-09" },
      false,
      ["行业研究", "投资分析"],
    ),
    seg(
      "seg_intern_hsbc",
      "internship",
      "HSBC",
      "证券服务实习生，协助处理基金每日 NAV 计算与核查，参与流程自动化项目，使用 Excel 与 VBA 优化重复操作环节。",
      { start: "2020-06", end: "2020-09" },
      false,
      ["流程优化", "自动化"],
    ),
    seg(
      "seg_edu_emlyon",
      "education",
      "EMLYON 硕士",
      "里昂商学院量化金融与市场金融方向硕士，系统学习量化分析、金融建模与数据处理方法。",
      { start: "2023-09", end: "2025-06" },
      false,
      ["量化金融", "数据能力"],
    ),
    seg(
      "seg_skill_certs",
      "skill",
      "技能证书",
      "熟练使用 SQL、Python（Pandas/NumPy）进行业务数据分析；掌握 Axure、Figma 等产品工具；CFA 一级。",
      { start: "2025-01", end: "present" },
      false,
      ["SQL", "Python", "CFA"],
    ),
  ],
};

const version = (
  id: string,
  company: string,
  position: string,
  score: number,
  applied: boolean,
  updatedDaysAgo: number,
  appliedDaysAgo?: number,
): CompiledVersion => ({
  id,
  masterId: DEMO_MASTER.id,
  name: `${company}-${position}`,
  jobDescription: {
    company,
    position,
    rawText: `${company} ${position} 岗位 JD（示例）`,
  },
  segmentDecisions: [],
  gapAnalysis: {
    expressionGaps: [],
    substantiveGaps: [],
    overallJudgment:
      score >= 70 ? "recommended" : score >= 60 ? "improve_first" : "not_recommended",
    overallScore: score,
  },
  applicationMark: applied
    ? { applied: true, appliedAt: iso(appliedDaysAgo ?? updatedDaysAgo) }
    : { applied: false },
  language: "zh",
  createdAt: iso(updatedDaysAgo + 1),
  updatedAt: iso(updatedDaysAgo),
});

export const DEMO_VERSIONS: CompiledVersion[] = [
  version("ver_demo_1", "字节跳动", "AI 产品经理", 84, true, 0, 0),
  version("ver_demo_2", "京东", "AI 产品经理", 72, false, 1),
  version("ver_demo_3", "美团", "策略产品经理", 66, true, 3, 2),
  version("ver_demo_4", "腾讯", "高级产品经理", 53, false, 5),
];

/** 拼出一份"已有母版 + 子版库"的 AppStorage 视图，供预览开关使用（不落盘） */
export function buildDemoStorage(base: AppStorage): AppStorage {
  return {
    ...base,
    master: DEMO_MASTER,
    compiledVersions: DEMO_VERSIONS,
  };
}
