// ============================================================================
// 日期工具
// ============================================================================

/** ISO 时间 → 中文相对日期（今天 / 昨天 / N 天前 / YYYY-MM-DD） */
export function formatRelativeDate(iso: string): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";

  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round(
    (startOfDay(new Date()) - startOfDay(then)) / 86400000,
  );

  if (diffDays <= 0) return "今天";
  if (diffDays === 1) return "昨天";
  if (diffDays < 30) return `${diffDays} 天前`;
  return then.toISOString().slice(0, 10);
}
