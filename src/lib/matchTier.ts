// ============================================================================
// 匹配度四级分级（文档 2.7）
// ----------------------------------------------------------------------------
// 分数(0-100) → 颜色 / 边框 / 浅底 / 文字含义。产品级概念，工作台、完成页、子版库
// 等多处共用，统一从这里取，保证四级分色一致。颜色严格对齐 _refs 设计。
// ============================================================================

export interface MatchTier {
  /** 主色（分数数字、标签文字、进度环主色） */
  color: string;
  /** 渐变浅色端（圆环渐变起点） */
  light: string;
  /** 边框色（卡片浅色描边） */
  border: string;
  /** 浅底色（标签背景） */
  bg: string;
  /** 文字含义标签 */
  label: string;
}

/**
 * 四级阈值（80 / 70 / 60）是产品定义（文档 2.7），非算法硬约束。
 * 措辞遵循"差距较大，建议补充经历"而非挫败性的"不匹配"。
 */
export function matchTier(score: number): MatchTier {
  if (score >= 80) {
    return { color: "#4f46e5", light: "#6366f1", border: "#c7d2fe", bg: "#eef2ff", label: "强匹配" };
  }
  if (score >= 70) {
    return { color: "#059669", light: "#34d399", border: "#a7f3d0", bg: "#ecfdf5", label: "基本匹配" };
  }
  if (score >= 60) {
    return { color: "#d97706", light: "#fbbf24", border: "#fde68a", bg: "#fffbeb", label: "建议改进后投递" };
  }
  return { color: "#e11d48", light: "#fb7185", border: "#fecdd3", bg: "#fff1f2", label: "差距较大" };
}
