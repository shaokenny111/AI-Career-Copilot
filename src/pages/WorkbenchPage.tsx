// ============================================================================
// 工作台页（Phase 6A）—— 三栏结构 + 三色展示 + 红色确认 + 段落切换
// ----------------------------------------------------------------------------
// 视觉严格参考 _refs/ui/workbench_final.jsx。本步只做"能看能点"：
//   · 左栏：段落导航（done✓/current/todo + 编译进度 + 母版保持完整提示）
//   · 中栏：原文卡 → AI 拆解改写分隔 → 三色 bullet 卡（左色条；红色加色边框+底色）
//           bullet：来源标签、命中 JD 词 indigo 下划线、折叠"为什么这样改"、hover 编辑
//           红色：行内"我有，采纳"/"我没有"，待确认→已采纳/已排除（绝不默认采纳）
//           "采纳全部绿色/黄色"（红色排除）
//   · 右栏：占位骨架（确定性评分 / 双环 / JD 命中联动 留给 6B）
//
// 数据全部来自真实编译结果（按 :versionId 从 storage 读 CompiledVersion），非写死。
// 红色确认 / 文本编辑即时回写 storage。本步不做：评分算法、双环、JD 联动、预览弹窗、
// 完成编译按钮门控。
// ============================================================================

import {
  useMemo,
  useState,
  type CSSProperties,
  type FC,
  type ReactNode,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  CheckCircle2, CircleHelp, CircleAlert, AlertCircle, Pencil, ChevronDown,
  Info, Check, X, ArrowLeft, ArrowRight, Sparkles, Database, Target, Lock,
} from "lucide-react";
import { getCompiledVersion, loadStorage, updateCompiledVersion } from "../lib/storage";
import type {
  CompiledVersion, Master, RewrittenBullet, Segment, SegmentDecision, SourceLevel,
} from "../types";

const SEG_TYPE_LABEL: Record<Segment["type"], string> = {
  work: "工作经历", internship: "实习经历", project: "项目经历", education: "教育背景",
  skill: "技能特长", certificate: "证书", award: "获奖", activity: "课外活动", other: "其他",
};

const SOURCE: Record<
  SourceLevel,
  { dot: string; text: string; soft: string; border: string; bar: string; icon: typeof CheckCircle2; label: string }
> = {
  green:  { dot: "#059669", text: "#047857", soft: "#ecfdf5", border: "#a7f3d0", bar: "#059669", icon: CheckCircle2, label: "基于原文" },
  yellow: { dot: "#d97706", text: "#b45309", soft: "#fffbeb", border: "#fde68a", bar: "#d97706", icon: CircleHelp, label: "推断信息" },
  red:    { dot: "#e11d48", text: "#be123c", soft: "#fff1f2", border: "#fecdd3", bar: "#e11d48", icon: CircleAlert, label: "AI 补充" },
};

const bulletKey = (segId: string, i: number) => `${segId}__${i}`;

export default function WorkbenchPage() {
  const navigate = useNavigate();
  const { versionId } = useParams();

  const master = useMemo<Master | null>(() => loadStorage().master, []);
  const [version, setVersion] = useState<CompiledVersion | null>(() =>
    versionId ? getCompiledVersion(versionId) : null,
  );

  // 段落顺序跟随母版；只展示母版里存在的段
  const segments = useMemo<Segment[]>(
    () =>
      version && master
        ? version.segmentDecisions
            .map((d) => master.segments.find((s) => s.id === d.segmentId))
            .filter((s): s is Segment => !!s)
        : [],
    [version, master],
  );

  const [activeId, setActiveId] = useState<string>("");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  // 绿/黄"已审阅"手势（默认计入，此处仅作 UX 进度标记，不落盘）
  const [reviewed, setReviewed] = useState<Record<string, boolean>>({});

  // 初始化 activeId 为首段
  const effectiveActive = activeId || segments[0]?.id || "";

  if (!version || !master) {
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

  const decisionOf = (segId: string): SegmentDecision | undefined =>
    version.segmentDecisions.find((d) => d.segmentId === segId);

  // ---- 段落状态：current / todo / done ----
  function statusOf(segId: string): "current" | "todo" | "done" {
    if (segId === effectiveActive) return "current";
    const d = decisionOf(segId);
    if (!d || !d.finalIncluded) return "done"; // 隐藏段无需处理
    const pendingRed = d.bullets.some((b) => b.sourceLevel === "red" && !b.redConfirmation);
    const hasGy = d.bullets.some((b) => b.sourceLevel !== "red");
    const gyAllReviewed = d.bullets.every((b, i) => b.sourceLevel === "red" || reviewed[bulletKey(segId, i)]);
    if (pendingRed || (hasGy && !gyAllReviewed)) return "todo";
    return "done";
  }

  const doneCount = segments.filter((s) => statusOf(s.id) === "done").length;
  const total = segments.length;
  const idx = segments.findIndex((s) => s.id === effectiveActive);
  const go = (delta: number) => {
    const ni = Math.max(0, Math.min(segments.length - 1, idx + delta));
    setActiveId(segments[ni].id);
    setEditingKey(null);
  };

  // ---- 回写 storage 的 bullet patch ----
  function patchBullet(segId: string, i: number, patch: Partial<RewrittenBullet>) {
    setVersion((prev) => {
      if (!prev) return prev;
      const next: CompiledVersion = {
        ...prev,
        updatedAt: new Date().toISOString(),
        segmentDecisions: prev.segmentDecisions.map((d) =>
          d.segmentId !== segId
            ? d
            : { ...d, bullets: d.bullets.map((b, bi) => (bi === i ? { ...b, ...patch } : b)) },
        ),
      };
      updateCompiledVersion(next);
      return next;
    });
  }

  const confirmRed = (segId: string, i: number, action: "accept" | "reject") =>
    patchBullet(segId, i, {
      redConfirmation: { confirmed: true, action, confirmedAt: new Date().toISOString() },
    });

  const saveEdit = (segId: string, i: number, text: string) => {
    patchBullet(segId, i, { userEditedText: text });
    setEditingKey(null);
  };

  const acceptAllGreenYellow = (segId: string, d: SegmentDecision) => {
    const map: Record<string, boolean> = {};
    d.bullets.forEach((b, i) => {
      if (b.sourceLevel !== "red") map[bulletKey(segId, i)] = true;
    });
    setReviewed((p) => ({ ...p, ...map }));
  };

  // 命中 JD 词高亮（matchedJdPhrases → indigo 下划线）
  const highlight = (text: string, phrases: string[]): ReactNode => {
    const hl = phrases.filter(Boolean);
    if (!hl.length) return text;
    const re = new RegExp(`(${hl.map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g");
    return text.split(re).map((part, i) =>
      hl.includes(part) ? (
        <span key={i} style={{ borderBottom: "2px solid #6366f1", color: "#4338ca", fontWeight: 600, paddingBottom: 1 }}>{part}</span>
      ) : (
        <span key={i}>{part}</span>
      ),
    );
  };

  const activeSeg = segments.find((s) => s.id === effectiveActive);
  const activeDec = activeSeg ? decisionOf(activeSeg.id) : undefined;
  const jd = version.jobDescription;

  return (
    <div style={{ position: "relative" }}>
      <style>{`
        .seg:hover { background:#f1f5f9; }
        .gbtn { transition: all .15s; } .gbtn:hover { background:#f8fafc; border-color:#cbd5e1; }
        .pbtn { transition: all .15s; } .pbtn:hover:not(:disabled) { box-shadow:0 6px 18px rgba(79,70,229,.35); transform:translateY(-1px); }
        .bcard { transition: box-shadow .2s, border-color .2s; }
        .bcard:hover { box-shadow:0 3px 12px rgba(15,23,42,.07); }
        .bcard .edit-btn { opacity:0; transition: opacity .15s; }
        .bcard:hover .edit-btn { opacity:1; }
        .expand:hover { color:#4f46e5; }
        .wbcol { overflow-y:auto; }
      `}</style>

      {/* 上下文条：面包屑（公司·职位）+ 线性步骤（当前=编译） */}
      <div style={{ height: 44, borderBottom: "1px solid #e2e8f0", background: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px" }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "#64748b" }}>
          {jd.company} · {jd.position}
        </div>
        <StepBar current={1} />
      </div>

      {/* 三栏 */}
      <div style={{ display: "grid", gridTemplateColumns: "248px 1fr 320px", height: "calc(100vh - 60px - 44px)", minHeight: 560 }}>
        {/* 左栏 */}
        <aside className="wbcol" style={{ borderRight: "1px solid #e2e8f0", background: "#fff", padding: "20px 14px" }}>
          <div style={navTitle}>简历段落</div>
          <div style={{ margin: "0 10px 14px", padding: "8px 10px", background: "#f5f3ff", borderRadius: 8, fontSize: 11, color: "#6366f1", lineHeight: 1.5 }}>
            母版保持完整 · 你正在编辑针对此岗位的子版
          </div>
          {segments.map((s) => {
            const st = statusOf(s.id);
            const d = decisionOf(s.id);
            const isA = s.id === effectiveActive;
            return (
              <div key={s.id} className="seg" onClick={() => { setActiveId(s.id); setEditingKey(null); }}
                style={{ display: "flex", alignItems: "flex-start", gap: 11, padding: "10px 12px", borderRadius: 10, cursor: "pointer", marginBottom: 3, background: isA ? "#eef2ff" : "transparent", boxShadow: isA ? "inset 3px 0 0 #4f46e5" : "none" }}>
                <div style={{ marginTop: 1 }}>
                  {st === "done" ? (
                    <CheckCircle2 size={17} color="#059669" />
                  ) : st === "current" ? (
                    <div style={{ width: 17, height: 17, borderRadius: 99, background: "#4f46e5", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <div style={{ width: 6, height: 6, borderRadius: 99, background: "#fff" }} />
                    </div>
                  ) : (
                    <div style={{ width: 17, height: 17, borderRadius: 99, border: "2px solid #cbd5e1" }} />
                  )}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: isA ? 600 : 500, color: isA ? "#4338ca" : "#334155", lineHeight: 1.3 }}>{s.title}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                    {SEG_TYPE_LABEL[s.type]}
                    {d && !d.finalIncluded ? " · 本次隐藏" : ""}
                  </div>
                </div>
              </div>
            );
          })}
          <div style={{ margin: "18px 10px 0", padding: 16, borderRadius: 12, background: "linear-gradient(135deg,#f8fafc,#f1f5f9)", border: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
              <span>编译进度</span><span style={{ fontWeight: 600, color: "#1e293b" }}>{doneCount}/{total}</span>
            </div>
            <div style={{ height: 6, background: "#e2e8f0", borderRadius: 99, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${total ? (doneCount / total) * 100 : 0}%`, background: "linear-gradient(90deg,#6366f1,#4f46e5)", borderRadius: 99, transition: "width .3s" }} />
            </div>
          </div>
        </aside>

        {/* 中栏 */}
        <main className="wbcol" style={{ padding: "28px 40px" }}>
          <div style={{ maxWidth: 660, margin: "0 auto" }}>
            {activeSeg && activeDec ? (
              <>
                <div className="serif" style={{ fontSize: 25, fontWeight: 600 }}>{activeSeg.title}</div>
                <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 3, marginBottom: 20 }}>
                  {SEG_TYPE_LABEL[activeSeg.type]}
                  {activeSeg.timeRange.start ? ` · ${activeSeg.timeRange.start} ~ ${activeSeg.isCurrent ? "至今" : activeSeg.timeRange.end}` : ""}
                </div>

                {!activeDec.finalIncluded ? (
                  // 隐藏段
                  <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 24 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 600, color: "#64748b", marginBottom: 10 }}>
                      <Lock size={15} color="#94a3b8" /> 本次投递建议隐藏（相关度 {activeDec.relevance}）
                    </div>
                    <div style={{ fontSize: 13.5, color: "#475569", lineHeight: 1.7 }}>{activeDec.relevanceReason}</div>
                    {activeDec.transferableValue && (
                      <div style={{ marginTop: 12, fontSize: 12.5, color: "#94a3b8", lineHeight: 1.6 }}>
                        可迁移价值：{activeDec.transferableValue}
                      </div>
                    )}
                    <div style={{ marginTop: 14, fontSize: 12, color: "#6366f1", background: "#eef2ff", padding: "9px 12px", borderRadius: 9, lineHeight: 1.5 }}>
                      隐藏不是删除 —— 这段经历在母版里始终完整保留。
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "#6366f1", background: "#eef2ff", padding: "9px 13px", borderRadius: 9, marginBottom: 18 }}>
                      <Sparkles size={14} /> AI 把这段原文拆解、改写成 {activeDec.bullets.length} 条 bullet，每条标注信息来源
                    </div>

                    {/* 原文卡 */}
                    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "16px 18px", boxShadow: "0 1px 2px -1px rgb(15 23 42/.08), 0 4px 12px -2px rgb(15 23 42/.06)" }}>
                      <div style={origLabel}>原文（你的母版）</div>
                      <div style={{ fontSize: 14, color: "#64748b", lineHeight: 1.7 }}>{activeSeg.content}</div>
                    </div>

                    {/* 分隔 */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "6px 0" }}>
                      <div style={{ width: 1, height: 12, background: "#cbd5e1" }} />
                      <div style={{ fontSize: 11, color: "#94a3b8", display: "flex", alignItems: "center", gap: 5, padding: "2px 0" }}><Sparkles size={11} color="#6366f1" /> AI 拆解改写</div>
                      <div style={{ width: 1, height: 12, background: "#cbd5e1" }} />
                    </div>

                    {/* 采纳全部绿黄 */}
                    {(() => {
                      const gy = activeDec.bullets.filter((b) => b.sourceLevel !== "red");
                      const hasRed = activeDec.bullets.some((b) => b.sourceLevel === "red");
                      if (gy.length === 0) return null;
                      const allReviewed = activeDec.bullets.every((b, i) => b.sourceLevel === "red" || reviewed[bulletKey(activeSeg.id, i)]);
                      return (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, padding: "10px 14px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10 }}>
                          <span style={{ fontSize: 12.5, color: "#94a3b8" }}>{hasRed ? "红色需你单独确认" : "全部为可信改写"}</span>
                          <button className="gbtn" onClick={() => acceptAllGreenYellow(activeSeg.id, activeDec)} disabled={allReviewed}
                            style={{ ...ghostBtn, padding: "6px 12px", fontSize: 12.5, opacity: allReviewed ? 0.5 : 1, cursor: allReviewed ? "default" : "pointer" }}>
                            <CheckCircle2 size={14} color="#059669" /> {allReviewed ? "绿色/黄色已采纳" : "采纳全部绿色 / 黄色"}
                          </button>
                        </div>
                      );
                    })()}

                    {/* bullet 卡片 */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      {activeDec.bullets.map((b, i) => (
                        <BulletCard
                          key={bulletKey(activeSeg.id, i)}
                          b={b}
                          index={i}
                          expanded={!!expanded[bulletKey(activeSeg.id, i)]}
                          editing={editingKey === bulletKey(activeSeg.id, i)}
                          reviewed={!!reviewed[bulletKey(activeSeg.id, i)]}
                          onToggleExpand={() => setExpanded((p) => ({ ...p, [bulletKey(activeSeg.id, i)]: !p[bulletKey(activeSeg.id, i)] }))}
                          onEdit={() => setEditingKey(bulletKey(activeSeg.id, i))}
                          onSaveEdit={(text) => saveEdit(activeSeg.id, i, text)}
                          onConfirmRed={(action) => confirmRed(activeSeg.id, i, action)}
                          highlight={highlight}
                        />
                      ))}
                    </div>
                  </>
                )}

                {/* 段落导航 */}
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 28, paddingTop: 20, borderTop: "1px solid #e2e8f0" }}>
                  <button className="gbtn" onClick={() => go(-1)} disabled={idx === 0} style={{ ...ghostBtn, opacity: idx === 0 ? 0.4 : 1 }}><ArrowLeft size={15} /> 上一段</button>
                  <button className="pbtn" onClick={() => go(1)} disabled={idx === segments.length - 1} style={{ ...primaryBtn, opacity: idx === segments.length - 1 ? 0.4 : 1 }}>下一段 <ArrowRight size={15} /></button>
                </div>
              </>
            ) : (
              <div style={{ color: "#94a3b8", fontSize: 14, paddingTop: 40 }}>这个子版没有可编辑的段落。</div>
            )}
          </div>
        </main>

        {/* 右栏：占位骨架（评分 / JD 联动 → 6B） */}
        <aside className="wbcol" style={{ borderLeft: "1px solid #e2e8f0", background: "#fff", padding: 22, display: "flex", flexDirection: "column", gap: 22 }}>
          <section>
            <div style={{ ...sideTitle, display: "flex", alignItems: "center", gap: 6, marginBottom: 14 }}><Target size={13} /> 整份简历匹配度</div>
            <div style={{ background: "linear-gradient(135deg,#fafbff,#f5f3ff)", border: "1px solid #e9ecfb", borderRadius: 16, padding: "26px 16px", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
              <div style={{ width: 116, height: 116, borderRadius: 999, border: "11px solid #eef2ff", display: "flex", alignItems: "center", justifyContent: "center", color: "#cbd5e1", fontSize: 13, textAlign: "center", lineHeight: 1.4 }}>
                评分<br />Phase 6B
              </div>
              <div style={{ fontSize: 11.5, color: "#94a3b8", textAlign: "center", lineHeight: 1.5 }}>
                确定性加权命中率评分 + 双环 + 随采纳实时上涨，下一步接入
              </div>
            </div>
          </section>
          <section style={{ paddingTop: 22, borderTop: "1px solid #f1f5f9" }}>
            <div style={{ ...sideTitle, display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}><Database size={13} /> 本段命中的 JD 词</div>
            {activeDec?.finalIncluded ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {Array.from(new Set(activeDec.bullets.flatMap((b) => b.matchedJdPhrases))).slice(0, 12).map((p) => (
                  <span key={p} style={{ fontSize: 11, background: "#eef2ff", color: "#4338ca", padding: "2px 9px", borderRadius: 99, fontWeight: 500 }}>{p}</span>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12.5, color: "#cbd5e1" }}>本段本次投递隐藏</div>
            )}
            <div style={{ fontSize: 11, color: "#cbd5e1", marginTop: 12, lineHeight: 1.5 }}>
              （JD 命中追溯 / 联动高亮在 6B 接入）
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

// ============================ bullet 卡片 ============================

interface BulletCardProps {
  b: RewrittenBullet;
  index: number;
  expanded: boolean;
  editing: boolean;
  reviewed: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onSaveEdit: (text: string) => void;
  onConfirmRed: (action: "accept" | "reject") => void;
  highlight: (text: string, phrases: string[]) => ReactNode;
}

const BulletCard: FC<BulletCardProps> = ({
  b, index, expanded, editing, reviewed, onToggleExpand, onEdit, onSaveEdit, onConfirmRed, highlight,
}) => {
  const m = SOURCE[b.sourceLevel];
  const Icon = m.icon;
  const isRed = b.sourceLevel === "red";
  const text = b.userEditedText ?? b.rewrittenText;
  const conf = b.redConfirmation;

  return (
    <div className="bcard" style={{ border: `1px solid ${isRed ? m.border : "#e2e8f0"}`, borderLeft: `3px solid ${m.bar}`, borderRadius: 14, background: isRed ? m.soft : "#fff", overflow: "hidden", boxShadow: isRed ? "0 2px 8px rgba(225,29,72,.06)" : "0 1px 3px rgba(15,23,42,.05)" }}>
      <div style={{ padding: "15px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 11 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#cbd5e1" }}>{String(index + 1).padStart(2, "0")}</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: m.soft, border: `1px solid ${m.border}`, padding: "3px 9px", borderRadius: 99 }}>
              <Icon size={13} color={m.dot} /><span style={{ fontSize: 11.5, fontWeight: 600, color: m.text }}>{m.label}</span>
            </span>
            {!isRed && reviewed && (
              <span style={{ fontSize: 11, color: "#059669", display: "inline-flex", alignItems: "center", gap: 3 }}><Check size={12} /> 已采纳</span>
            )}
          </div>
          {!isRed && (
            <button className="gbtn edit-btn" onClick={onEdit} style={{ ...ghostBtn, padding: "5px 9px", fontSize: 12 }}><Pencil size={12} /> 编辑</button>
          )}
        </div>

        {editing ? (
          <textarea
            defaultValue={text}
            autoFocus
            onBlur={(e) => onSaveEdit(e.target.value)}
            style={{ width: "100%", minHeight: 64, border: "1.5px solid #c7d2fe", borderRadius: 8, padding: 11, fontSize: 14, lineHeight: 1.6, color: "#1e293b", outline: "none", resize: "vertical", fontFamily: "inherit" }}
          />
        ) : (
          <div style={{ fontSize: 14.5, lineHeight: 1.7, color: isRed ? "#9f1239" : "#1e293b" }}>{highlight(text, b.matchedJdPhrases)}</div>
        )}

        {/* 为什么这样改（折叠） */}
        <button className="expand" onClick={onToggleExpand} style={{ marginTop: 11, display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 12, color: "#94a3b8" }}>
          <Info size={12} /> 为什么这样改 <ChevronDown size={13} style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
        </button>
        {expanded && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #f1f5f9", fontSize: 12.5, color: "#64748b", lineHeight: 1.65 }}>
            <div><span style={{ fontWeight: 600, color: "#475569" }}>改动 </span>{b.whatChanged}</div>
            <div><span style={{ fontWeight: 600, color: "#475569" }}>原因 </span>{b.whyChanged}</div>
            {b.originalText && (
              <div style={{ marginTop: 6, color: "#94a3b8" }}><span style={{ fontWeight: 600, color: "#475569" }}>原文 </span>{b.originalText}</div>
            )}
            {b.matchedJdPhrases.length > 0 && (
              <div style={{ marginTop: 9, display: "flex", gap: 6, flexWrap: "wrap" }}>
                {b.matchedJdPhrases.map((k) => <span key={k} style={{ fontSize: 11, background: "#eef2ff", color: "#4338ca", padding: "2px 9px", borderRadius: 99, fontWeight: 500 }}>命中 · {k}</span>)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 红色行内确认 */}
      {isRed && (
        <div style={{ background: "#fff", borderTop: `1px solid ${m.border}`, padding: "13px 18px" }}>
          {!conf ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "#be123c" }}><AlertCircle size={15} /> AI 推测你可能有此经历，请确认</div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <button className="pbtn" onClick={() => onConfirmRed("accept")} style={redBtn}><Check size={14} /> 我有，采纳</button>
                <button className="gbtn" onClick={() => onConfirmRed("reject")} style={rejectBtn}><X size={14} /> 我没有</button>
              </div>
            </div>
          ) : conf.action === "reject" ? (
            <div style={{ fontSize: 12.5, color: "#94a3b8", display: "flex", alignItems: "center", gap: 7 }}><X size={15} /> 已排除 — 不写入简历</div>
          ) : (
            <div style={{ fontSize: 12.5, color: "#047857", display: "flex", alignItems: "center", gap: 7, fontWeight: 500 }}><CheckCircle2 size={15} /> 已采纳 — 将写入子版（建议补充真实细节）</div>
          )}
        </div>
      )}
    </div>
  );
};

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

const primaryBtn: CSSProperties = { display: "flex", alignItems: "center", gap: 6, background: "linear-gradient(135deg,#6366f1,#4f46e5)", color: "#fff", border: "none", borderRadius: 9, padding: "9px 17px", fontSize: 13, fontWeight: 600, cursor: "pointer", boxShadow: "0 2px 8px rgba(79,70,229,.25)" };
const ghostBtn: CSSProperties = { display: "flex", alignItems: "center", gap: 6, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 9, padding: "8px 13px", fontSize: 13, color: "#475569", cursor: "pointer" };
const redBtn: CSSProperties = { display: "flex", alignItems: "center", gap: 5, background: "linear-gradient(135deg,#f43f5e,#e11d48)", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", boxShadow: "0 2px 8px rgba(225,29,72,.25)" };
const rejectBtn: CSSProperties = { display: "flex", alignItems: "center", gap: 5, background: "#fff", color: "#64748b", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 14px", fontSize: 12.5, fontWeight: 500, cursor: "pointer" };
const navTitle: CSSProperties = { fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".07em", padding: "0 12px 14px" };
const sideTitle: CSSProperties = { fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: ".06em" };
const origLabel: CSSProperties = { fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 };
