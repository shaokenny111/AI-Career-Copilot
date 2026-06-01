// ============================================================================
// 工作台页（占位）—— Phase 6 接入：三色 bullet 采纳/编辑、实时确定性匹配度评分、
// 差距面板、导出等。本步仅按 :versionId 从 storage 读出编译好的子版，展示概要，
// 证明编译管线的数据正确组装并落盘、跳转与数据传递无误。
// ============================================================================

import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getCompiledVersion, loadStorage } from "../lib/storage";

export default function WorkbenchPage() {
  const navigate = useNavigate();
  const { versionId } = useParams();
  const version = useMemo(
    () => (versionId ? getCompiledVersion(versionId) : null),
    [versionId],
  );
  const master = useMemo(() => loadStorage().master, []);

  if (!version) {
    return (
      <div className="mx-auto max-w-xl py-24 text-center">
        <h1 className="mb-2 text-xl font-bold text-slate-900">没找到这个子版</h1>
        <p className="mb-6 text-sm font-medium text-slate-400">
          可能尚未编译，或链接已失效。
        </p>
        <button
          onClick={() => navigate("/")}
          className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white"
        >
          返回首页
        </button>
      </div>
    );
  }

  const { jobDescription: jd, segmentDecisions, gapAnalysis } = version;
  const includedCount = segmentDecisions.filter((d) => d.finalIncluded).length;
  const segTitle = (id: string) =>
    master?.segments.find((s) => s.id === id)?.title ?? id;

  const relBadge: Record<string, string> = {
    high: "bg-emerald-50 text-emerald-700 border-emerald-200",
    medium: "bg-amber-50 text-amber-700 border-amber-200",
    low: "bg-rose-50 text-rose-700 border-rose-200",
  };

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
        工作台（Phase 6 接入）· 以下为编译草稿概要
      </div>
      <h1 className="text-2xl font-black tracking-tight text-slate-900">
        {jd.company} · {jd.position}
      </h1>
      <div className="mt-1 text-sm font-medium text-slate-400">
        子版 {version.name} · 共 {segmentDecisions.length} 段，纳入 {includedCount} 段 ·
        匹配度 {gapAnalysis.overallScore}（占位，Phase 6 实时算）· 整体建议 {gapAnalysis.overallJudgment}
      </div>

      <h2 className="mb-2 mt-8 text-sm font-bold text-slate-700">段落决策</h2>
      <div className="space-y-2">
        {segmentDecisions.map((d) => (
          <div
            key={d.segmentId}
            className="rounded-xl border border-slate-200 bg-white p-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-slate-800">
                {segTitle(d.segmentId)}
              </span>
              <span
                className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${relBadge[d.relevance] ?? ""}`}
              >
                {d.relevance}
              </span>
              <span className="text-[11px] font-medium text-slate-400">
                {d.suggestedAction} · {d.finalIncluded ? "纳入" : "隐藏"} ·{" "}
                {d.bullets.length} bullets
              </span>
            </div>
            {d.relevanceReason && (
              <div className="mt-1 text-xs text-slate-500">{d.relevanceReason}</div>
            )}
          </div>
        ))}
      </div>

      <h2 className="mb-2 mt-8 text-sm font-bold text-slate-700">
        差距分析（表达性 {gapAnalysis.expressionGaps.length} · 实质性{" "}
        {gapAnalysis.substantiveGaps.length}）
      </h2>
      <div className="space-y-2">
        {gapAnalysis.substantiveGaps.map((g, i) => (
          <div
            key={i}
            className="rounded-xl border border-rose-100 bg-rose-50/40 p-4 text-sm"
          >
            <span className="font-semibold text-rose-700">[{g.severity}]</span>{" "}
            <span className="text-slate-700">{g.jdRequirement}</span>
            <div className="mt-1 text-xs text-slate-500">{g.interviewStrategy}</div>
          </div>
        ))}
      </div>

      <button
        onClick={() => navigate("/")}
        className="mt-8 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600"
      >
        返回首页
      </button>
    </div>
  );
}
