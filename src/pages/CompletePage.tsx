// ============================================================================
// 完成页（Phase 7A）—— 骨架 + 路由 + 复用 scoring 的最终匹配度
// ----------------------------------------------------------------------------
// 视觉参考 _refs/ui/complete_final_v2.jsx。本步只做"读 + 展示"：
//   · Header：logo 回首页 + 面包屑（公司·职位）+ 步骤条（当前=完成）+ 返回工作台
//   · 完成标志 + 标题
//   · 主角双环（HeroRing）：最终匹配度 —— 必须复用 src/lib/scoring.ts 的
//     computeMatchScore，与工作台同一套分，两处分数必然一致（同函数同入参）
//   · 各段改写采纳明细（adopted/total）
//   · 采纳后的 bullet 列表（最终写入子版的内容；采纳判定复用 isBulletAdopted）
//   · 底部出口：返回我的简历 / 再编译一个岗位
//
// 明确不做（留给 7B/7C/7D）：导出（PDF/Word/复制）、诚实差距、投递标记。
// 数据全部来自 storage 的 CompiledVersion，非写死。本步不打 Gemini、不烧配额。
// ============================================================================

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  CheckCircle2, ChevronDown, ChevronUp, ArrowLeft, TrendingUp,
  Home, RotateCcw, Copy, Check, FileType, Loader2, FileDown,
  ShieldCheck, Sparkles, Send, X,
} from "lucide-react";
import { getCompiledVersion, loadStorage, setApplicationMark } from "../lib/storage";
import { useAppStorage } from "../lib/useAppStorage";
import { computeMatchScore, isBulletAdopted } from "../lib/scoring";
import { matchTier } from "../lib/matchTier";
import { formatRelativeDate } from "../lib/datetime";
import { copyText, downloadDocx, modelToPlainText, printPdf, segmentToPlainText, type ExportModel } from "../lib/export";
import type { CompiledVersion, GapSeverity, Master, Segment } from "../types";

// 实质差距严重度 → 标签 / 配色（hard_filter / important / minor）
const GAP_SEVERITY: Record<GapSeverity, { label: string; color: string; bar: string }> = {
  hard_filter: { label: "硬性门槛", color: "#e11d48", bar: "#f43f5e" },
  important: { label: "重要差距", color: "#d97706", bar: "#fbbf24" },
  minor: { label: "轻微差距", color: "#64748b", bar: "#94a3b8" },
};

const SEG_TYPE_LABEL: Record<Segment["type"], string> = {
  work: "工作经历", internship: "实习经历", project: "项目经历", education: "教育背景",
  skill: "技能特长", certificate: "证书", award: "获奖", activity: "课外活动", other: "其他",
};

/** 段落起止时间 → 显示串（与工作台口径一致：在职显示"至今"）。无明确时间返回空串。
 *  铁律：每段经历必须带回时间线，绝不可在完成页/导出丢失。 */
function formatSegTime(seg: Segment): string {
  const { start, end } = seg.timeRange;
  const endLabel = seg.isCurrent ? "至今" : end;
  if (start && endLabel) return `${start} ~ ${endLabel}`;
  return start || endLabel || "";
}

export default function CompletePage() {
  const navigate = useNavigate();
  const { versionId } = useParams();

  const master = useMemo<Master | null>(() => loadStorage().master, []);
  const version = useMemo<CompiledVersion | null>(
    () => (versionId ? getCompiledVersion(versionId) : null),
    [versionId],
  );
  // 投递标记走响应式存储：标记/取消即时反映，且首页子版库同步更新
  const liveStore = useAppStorage();

  const [showDetail, setShowDetail] = useState(false);

  // 最终匹配度：复用工作台同一纯函数、同一入参 → 两处分数必然一致
  const score = useMemo(
    () =>
      version
        ? computeMatchScore(
            version.segmentDecisions,
            version.jobDescription.requirements ?? [],
            version.requirementMatches,
          )
        : null,
    [version],
  );

  // 已纳入段落（顺序跟随母版），连带其采纳后的 bullet
  const includedSegments = useMemo(() => {
    if (!version || !master) return [];
    return version.segmentDecisions
      .filter((d) => d.finalIncluded)
      .map((d) => {
        const seg = master.segments.find((s) => s.id === d.segmentId);
        const adoptedBullets = d.bullets.filter(isBulletAdopted);
        return seg ? { seg, total: d.bullets.length, adoptedBullets } : null;
      })
      .filter((x): x is { seg: Segment; total: number; adoptedBullets: typeof version.segmentDecisions[number]["bullets"] } => !!x);
  }, [version, master]);

  // 导出单一数据源：从已渲染的 includedSegments 派生，导出与屏幕逐字同源
  const exportModel: ExportModel = useMemo(
    () => ({
      jdLabel: version
        ? `${version.jobDescription.company} · ${version.jobDescription.position}`
        : "",
      segments: includedSegments.map(({ seg, adoptedBullets }) => ({
        title: seg.title,
        typeLabel: SEG_TYPE_LABEL[seg.type],
        timeRange: formatSegTime(seg),
        bullets: adoptedBullets.map((b) => b.userEditedText ?? b.rewrittenText),
      })),
    }),
    [version, includedSegments],
  );

  // 复制反馈（key: "all" 或 "seg_<i>"），短暂高亮后复位
  const [copied, setCopied] = useState<string | null>(null);
  const doCopy = async (key: string, text: string) => {
    try {
      await copyText(text);
      setCopied(key);
      setTimeout(() => setCopied((k) => (k === key ? null : k)), 1600);
    } catch {
      setCopied(null);
    }
  };

  // Word 导出（.docx）：构建中 / 失败提示
  const [wordState, setWordState] = useState<"idle" | "busy" | "error">("idle");
  const doWord = async () => {
    setWordState("busy");
    try {
      await downloadDocx(exportModel, version?.name ?? "投递版本");
      setWordState("idle");
    } catch (e) {
      console.error("[export] docx failed", e);
      setWordState("error");
    }
  };

  if (!version || !master || !score) {
    return (
      <div className="mx-auto max-w-xl py-24 text-center">
        <h1 className="mb-2 text-xl font-bold text-slate-900">没找到这个子版</h1>
        <p className="mb-6 text-sm font-medium text-slate-400">可能尚未编译，或链接已失效。</p>
        <button onClick={() => navigate("/")} className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white">
          返回首页
        </button>
      </div>
    );
  }

  const jd = version.jobDescription;
  // 取响应式存储里本子版的投递标记（回退到 mount 时的快照）
  const liveMark =
    liveStore.compiledVersions.find((v) => v.id === version.id)?.applicationMark ??
    version.applicationMark;

  return (
    <div style={{ position: "relative" }}>
      <style>{`
        .gbtn { transition: all .15s; } .gbtn:hover { background:#f8fafc; border-color:#cbd5e1; }
        .cmpcol { overflow-y:auto; }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* 上下文条（全局 Layout 已提供品牌 header；此处只放面包屑 + 步骤 + 返回工作台，
          避免与 Layout header 叠成两层）*/}
      <div style={{ height: 44, borderBottom: "1px solid #e2e8f0", background: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px" }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "#64748b" }}>{jd.company} · {jd.position}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <StepBar current={2} />
          <button className="gbtn" onClick={() => navigate(`/workbench/${version.id}`)} style={ghostBtn}><ArrowLeft size={15} /> 返回工作台</button>
        </div>
      </div>

      <div style={{ position: "relative" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 380, background: "radial-gradient(55% 55% at 50% 0%, rgba(99,102,241,.10), transparent 70%)", pointerEvents: "none" }} />

        <div style={{ maxWidth: 720, margin: "0 auto", padding: "44px 24px 80px", position: "relative", zIndex: 1 }}>

          {/* 完成标志 + 标题 */}
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, color: "#059669", background: "#ecfdf5", border: "1px solid #a7f3d0", padding: "5px 14px", borderRadius: 99, marginBottom: 14 }}>
              <CheckCircle2 size={15} /> 编译完成
            </div>
            <div className="serif" style={{ fontSize: 28, fontWeight: 600 }}>你的投递版本已生成</div>
            <div style={{ fontSize: 14, color: "#94a3b8", marginTop: 6 }}>针对「{jd.company} · {jd.position}」</div>
          </div>

          {/* 模块1：最终匹配度双环（主角，复用 scoring.ts） */}
          <div className="card" style={{ padding: 36, marginBottom: 28, display: "flex", alignItems: "center", gap: 36, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, boxShadow: "0 1px 2px -1px rgb(15 23 42/.08), 0 4px 12px -2px rgb(15 23 42/.06)" }}>
            <HeroRing value={score.scoreNow} delta={score.delta} />
            <div style={{ flex: 1 }}>
              <div style={sectionTitle}>整份简历匹配度</div>
              <div style={{ fontSize: 15, color: "#334155", lineHeight: 1.7, margin: "12px 0" }}>
                按 JD 要求<b style={{ fontWeight: 600 }}>加权命中</b>计算，基于你实际采纳的改写。
                <br />改写前 {score.scoreBefore} 分，当前 <b style={{ fontWeight: 600, color: matchTier(score.scoreNow).color }}>{score.scoreNow}</b> 分（{matchTier(score.scoreNow).label}）。
              </div>
              <button onClick={() => setShowDetail(!showDetail)} className="gbtn" style={{ ...ghostBtn, marginTop: 6, padding: "7px 13px", fontSize: 12.5 }}>
                {showDetail ? <ChevronUp size={14} /> : <ChevronDown size={14} />} 各段采纳明细
              </button>
            </div>
          </div>

          {/* 各段改写采纳情况 */}
          {showDetail && (
            <div className="card" style={{ padding: 22, marginBottom: 28, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16 }}>
              <div style={{ ...sectionTitle, marginBottom: 16 }}>各段改写采纳情况</div>
              {includedSegments.length === 0 ? (
                <div style={{ fontSize: 13, color: "#94a3b8" }}>本子版没有纳入任何段落。</div>
              ) : (
                includedSegments.map(({ seg, total, adoptedBullets }) => (
                  <div key={seg.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "9px 0", fontSize: 13.5 }}>
                    <div style={{ width: 180, color: "#334155", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{seg.title}</div>
                    <div style={{ flex: 1, height: 6, background: "#f1f5f9", borderRadius: 99, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${total ? (adoptedBullets.length / total) * 100 : 0}%`, background: "linear-gradient(90deg,#6366f1,#4f46e5)", borderRadius: 99 }} />
                    </div>
                    <div style={{ width: 92, textAlign: "right", color: "#64748b" }}>采纳 {adoptedBullets.length}/{total} 条</div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* 模块「诚实差距」：实质差距 + 面试应对（只上屏、不入导出，差异化锚点） */}
          {version.gapAnalysis.substantiveGaps.length > 0 && (
            <div className="card" style={{ padding: 26, marginBottom: 24, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16 }}>
              <div style={{ ...sectionTitle, display: "flex", alignItems: "center", gap: 8, color: "#475569" }}>
                <ShieldCheck size={16} color="#4f46e5" /> 诚实差距 · 这些靠面试应对，不靠改写假装
              </div>
              <div style={{ fontSize: 13, color: "#94a3b8", margin: "8px 0 18px", lineHeight: 1.6 }}>
                我们不会用改写让你看起来像另一个人。以下是简历改写补不上的真实差距，附面试应对建议——只在此处供你准备，不会写进导出的简历。
              </div>
              {version.gapAnalysis.substantiveGaps.map((g, i) => {
                const sv = GAP_SEVERITY[g.severity];
                const last = i === version.gapAnalysis.substantiveGaps.length - 1;
                return (
                  <div key={i} style={{ padding: "16px 18px", borderRadius: 12, background: "#fafbfc", border: "1px solid #eef0f5", borderLeft: `3px solid ${sv.bar}`, marginBottom: last ? 0 : 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: sv.color }}>{sv.label}</span>
                      <span style={{ fontSize: 14.5, fontWeight: 600 }}>{g.jdRequirement}</span>
                    </div>
                    <div style={{ fontSize: 12.5, color: "#94a3b8", marginBottom: 9, lineHeight: 1.55 }}>
                      简历中无对应经历，改写无法补足——这是真实差距，不该靠改写假装具备。
                    </div>
                    <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.65, display: "flex", gap: 8 }}>
                      <Sparkles size={14} color="#6366f1" style={{ marginTop: 3, flexShrink: 0 }} />
                      <span><b style={{ color: "#475569", fontWeight: 600 }}>面试应对 </b>{g.interviewStrategy}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* 模块2：采纳后的最终内容（导出的唯一数据源；逐段复制入口） */}
          <div className="card" style={{ padding: 26, marginBottom: 24, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16 }}>
            <div style={sectionTitle}>最终投递内容</div>
            <div style={{ fontSize: 13, color: "#94a3b8", margin: "8px 0 18px", lineHeight: 1.6 }}>
              以下是采纳后将写入这份投递版的内容（红色补充仅在你确认后纳入）。导出 / 复制的就是这份干净文本，不含标注。
            </div>
            {exportModel.segments.length === 0 ? (
              <div style={{ fontSize: 13.5, color: "#94a3b8" }}>本子版没有纳入任何段落。</div>
            ) : (
              exportModel.segments.map((seg, i) => {
                const key = `seg_${i}`;
                return (
                  <div key={key} style={{ marginBottom: 22 }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 14.5, fontWeight: 600, color: "#1e293b" }}>{seg.title}</div>
                        <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 2, marginBottom: 10 }}>
                          {seg.typeLabel}{seg.timeRange ? ` · ${seg.timeRange}` : ""}
                        </div>
                      </div>
                      <button
                        className="gbtn"
                        onClick={() => doCopy(key, segmentToPlainText(seg))}
                        style={{ ...ghostBtn, flexShrink: 0, padding: "5px 11px", fontSize: 12, color: copied === key ? "#047857" : "#475569", borderColor: copied === key ? "#a7f3d0" : "#e2e8f0" }}
                      >
                        {copied === key ? <><Check size={13} /> 已复制</> : <><Copy size={13} /> 复制本段</>}
                      </button>
                    </div>
                    {seg.bullets.length === 0 ? (
                      <div style={{ fontSize: 13, color: "#cbd5e1", paddingLeft: 14 }}>（本段暂无已采纳的 bullet）</div>
                    ) : (
                      <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 7 }}>
                        {seg.bullets.map((t, bi) => (
                          <li key={bi} style={{ fontSize: 14, color: "#334155", lineHeight: 1.65 }}>{t}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* 模块3：导出投递版本（7B-1：逐段复制已在上方 / 此处复制全文；Word 见 7B-2） */}
          <div className="card" style={{ padding: 26, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16 }}>
            <div style={sectionTitle}>导出投递版本</div>
            <div style={{ fontSize: 13, color: "#94a3b8", margin: "8px 0 18px", lineHeight: 1.6 }}>
              导出的是上方"最终投递内容"的干净文本，与屏幕逐字一致。PDF 走系统打印，请在弹出的对话框中选择"另存为 PDF"。
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <button
                className="gbtn"
                disabled={exportModel.segments.length === 0}
                onClick={() => printPdf(exportModel, version.name)}
                style={{ ...ghostBtn, padding: "10px 16px", fontSize: 13.5, opacity: exportModel.segments.length === 0 ? 0.5 : 1 }}
              >
                <FileDown size={15} /> 导出 PDF
              </button>
              <button
                className="gbtn"
                disabled={exportModel.segments.length === 0 || wordState === "busy"}
                onClick={doWord}
                style={{ ...ghostBtn, padding: "10px 16px", fontSize: 13.5, opacity: exportModel.segments.length === 0 ? 0.5 : 1, cursor: wordState === "busy" ? "default" : "pointer" }}
              >
                {wordState === "busy" ? <><Loader2 size={15} className="spin" /> 生成中…</> : <><FileType size={15} /> 导出 Word (.docx)</>}
              </button>
              <button
                className="gbtn"
                disabled={exportModel.segments.length === 0}
                onClick={() => doCopy("all", modelToPlainText(exportModel))}
                style={{ ...ghostBtn, padding: "10px 16px", fontSize: 13.5, color: copied === "all" ? "#047857" : "#475569", borderColor: copied === "all" ? "#a7f3d0" : "#e2e8f0", opacity: exportModel.segments.length === 0 ? 0.5 : 1 }}
              >
                {copied === "all" ? <><Check size={15} /> 已复制全文</> : <><Copy size={15} /> 复制全文</>}
              </button>
              {wordState === "error" && <span style={{ fontSize: 12.5, color: "#e11d48" }}>导出失败，请重试</span>}
            </div>
          </div>

          {/* 模块4：投递标记（7D，记录日期；可取消；实时同步到首页子版库） */}
          <div style={{ marginTop: 24, borderRadius: 16, border: "1px solid #e0e7ff", background: "linear-gradient(135deg,#f5f3ff,#eef2ff)", padding: 22, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 14.5, fontWeight: 600 }}>投出去了吗？标记一下</div>
              <div style={{ fontSize: 12.5, color: "#6366f1", marginTop: 3 }}>
                {liveMark.applied
                  ? `已于 ${liveMark.appliedAt ? formatRelativeDate(liveMark.appliedAt) : "今天"} 投递 · 首页子版库已同步`
                  : "标记后可在首页子版库一眼看到哪些投了、哪些没投"}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {liveMark.applied && (
                <span style={{ fontSize: 12.5, color: "#059669", fontWeight: 500, display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <CheckCircle2 size={14} /> 已标记
                </span>
              )}
              <button
                className={liveMark.applied ? "gbtn" : "pbtn"}
                onClick={() => setApplicationMark(version.id, !liveMark.applied)}
                style={
                  liveMark.applied
                    ? { ...ghostBtn, padding: "10px 16px", fontSize: 13.5 }
                    : { display: "flex", alignItems: "center", gap: 6, background: "linear-gradient(135deg,#6366f1,#4f46e5)", color: "#fff", border: "none", borderRadius: 10, padding: "10px 18px", fontSize: 13.5, fontWeight: 600, cursor: "pointer", boxShadow: "0 2px 8px rgba(79,70,229,.25)" }
                }
              >
                {liveMark.applied ? <><X size={15} /> 取消标记</> : <><Send size={15} /> 标记为已投递</>}
              </button>
            </div>
          </div>

          {/* 底部出口 */}
          <div style={{ display: "flex", justifyContent: "center", gap: 12, paddingTop: 28 }}>
            <button className="gbtn" onClick={() => navigate("/")} style={ghostBtn}><Home size={15} /> 返回我的简历</button>
            <button className="gbtn" onClick={() => navigate("/upload")} style={ghostBtn}><RotateCcw size={15} /> 再编译一个岗位</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================ 主角双环 ============================

function CountUp({ to, duration = 1400 }: { to: number; duration?: number }) {
  const [v, setV] = useState(0);
  const raf = useRef<number | undefined>(undefined);
  useEffect(() => {
    let start: number | undefined;
    const step = (t: number) => {
      if (start === undefined) start = t;
      const p = Math.min((t - start) / duration, 1);
      setV(Math.round((1 - Math.pow(1 - p, 3)) * to));
      if (p < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current !== undefined) cancelAnimationFrame(raf.current);
    };
  }, [to, duration]);
  return <>{v}</>;
}

/** 完成页主角环：四级分色取自 lib/matchTier（与工作台一致） */
function HeroRing({ value, delta, size = 188, stroke = 15 }: { value: number; delta: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.max(0, Math.min(100, value)) / 100);
  const tier = matchTier(value);
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <defs>
          <linearGradient id="heroGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={tier.light} />
            <stop offset="100%" stopColor={tier.color} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef0f5" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="url(#heroGrad)" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset} style={{ transition: "stroke-dashoffset 1.5s cubic-bezier(.22,1,.36,1)" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span className="serif" style={{ fontSize: 58, fontWeight: 600, color: tier.color, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}><CountUp to={value} /></span>
        {delta > 0 && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 12.5, fontWeight: 600, color: "#059669", background: "#d1fae5", padding: "2px 9px", borderRadius: 99, marginTop: 8 }}>
            <TrendingUp size={12} /> 较改写前 +{delta}
          </span>
        )}
      </div>
    </div>
  );
}

// ============================ 步骤条 ============================

function StepBar({ current }: { current: number }) {
  const steps = ["上传", "编译", "完成"];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
      {steps.map((s, i) => {
        const active = i === current, done = i < current;
        return (
          <span key={s} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6, color: active ? "#4f46e5" : done ? "#059669" : "#cbd5e1", fontWeight: active ? 600 : 500 }}>
              <span style={{ width: 19, height: 19, borderRadius: 99, background: active ? "#4f46e5" : done ? "#059669" : "#f1f5f9", color: active || done ? "#fff" : "#94a3b8", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" }}>{done ? "✓" : i + 1}</span>
              {s}
            </span>
            {i < steps.length - 1 && <span style={{ width: 22, height: 1, background: "#e2e8f0" }} />}
          </span>
        );
      })}
    </div>
  );
}

// ============================ 样式常量 ============================

const sectionTitle: CSSProperties = { fontSize: 12, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: ".06em" };
const ghostBtn: CSSProperties = { display: "flex", alignItems: "center", gap: 6, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 9, padding: "8px 14px", fontSize: 13, color: "#475569", cursor: "pointer" };
