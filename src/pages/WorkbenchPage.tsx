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
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FC,
  type ReactNode,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  CheckCircle2, CircleHelp, CircleAlert, AlertCircle, Pencil, ChevronDown,
  Info, Check, X, ArrowLeft, ArrowRight, Sparkles, Database, Target, Lock,
  ListChecks, ThumbsUp,
} from "lucide-react";
import { getCompiledVersion, loadStorage, updateCompiledVersion } from "../lib/storage";
import { matchTier, MATCH_SCORE_NOTE } from "../lib/matchTier";
import { computeMatchScore, computeSegmentRequirements } from "../lib/scoring";
import { FACT_LIST_TYPES } from "../lib/compile";
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

  // ===== 全局匹配度（确定性加权命中率；随采纳/确认/编辑实时重算）=====
  // 与完成页共用 src/lib/scoring.ts，保证两处分数一致。version 任一变更触发重算。
  const score = useMemo(
    () =>
      version
        ? computeMatchScore(
            version.segmentDecisions,
            version.jobDescription.requirements ?? [],
            version.requirementMatches,
          )
        : {
            scoreNow: 0, scoreBefore: 0, delta: 0,
            hitWeightNow: 0, hitWeightBefore: 0, totalWeight: 0, requirements: [],
          },
    [version],
  );

  // 回填 overallScore 到 storage（Phase 7 完成页 / 子版库直接读这个数）。
  // 用函数式 setVersion + 等值守卫，避免 effect 自循环。
  useEffect(() => {
    setVersion((prev) => {
      if (!prev || prev.gapAnalysis.overallScore === score.scoreNow) return prev;
      const next: CompiledVersion = {
        ...prev,
        gapAnalysis: { ...prev.gapAnalysis, overallScore: score.scoreNow },
        updatedAt: new Date().toISOString(),
      };
      updateCompiledVersion(next);
      return next;
    });
  }, [score.scoreNow]);

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

  // ---- 段落是否"实质审完"（与"当前查看的段"彻底解耦：不看 active）----
  // done 只取决于数据：红色都已确认(redConfirmation) + 绿/黄都已逐条处理(gyDecision
  // 为 accept 或 reject，含「采纳全部绿黄」/手动编辑置 accept)。拒绝也算"已处理"。
  // 隐藏段无需处理，视为已完成；无 bullet 的段（every 对空集为真）也视为完成。
  function isSegmentDone(d: SegmentDecision | undefined): boolean {
    if (!d || !d.finalIncluded) return true;
    const pendingRed = d.bullets.some((b) => b.sourceLevel === "red" && !b.redConfirmation);
    const hasGy = d.bullets.some((b) => b.sourceLevel !== "red");
    const gyAllProcessed = d.bullets.every((b) => b.sourceLevel === "red" || b.gyDecision != null);
    return !(pendingRed || (hasGy && !gyAllProcessed));
  }

  // ---- 段落 UI 状态：current 仅是"你此刻停在这段"的纯高亮，不参与 done/allDone ----
  function statusOf(segId: string): "current" | "todo" | "done" {
    if (segId === effectiveActive) return "current";
    return isSegmentDone(decisionOf(segId)) ? "done" : "todo";
  }

  // allDone 只看每段是否实质审完，与用户此刻停在哪段无关（含当前段也参与计数）
  const doneCount = segments.filter((s) => isSegmentDone(decisionOf(s.id))).length;
  const total = segments.length;
  const allDone = total > 0 && doneCount === total;
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
    // 手动编辑即视为采纳该条（落盘）：写入编辑文本 + gyDecision=accept
    patchBullet(segId, i, { userEditedText: text, gyDecision: "accept" });
    setEditingKey(null);
  };

  // 绿/黄逐条接受/拒绝（对齐红色逐条模式；落盘，刷新不丢）
  const decideGy = (segId: string, i: number, action: "accept" | "reject") =>
    patchBullet(segId, i, { gyDecision: action });

  // 采纳全部绿/黄：便捷批量——把本段尚未处理的非红 bullet 置 accept，
  // 已被用户显式拒绝的保持 reject（不覆盖用户的取舍）。落盘。
  const acceptAllGreenYellow = (segId: string) => {
    setVersion((prev) => {
      if (!prev) return prev;
      const next: CompiledVersion = {
        ...prev,
        updatedAt: new Date().toISOString(),
        segmentDecisions: prev.segmentDecisions.map((d) =>
          d.segmentId !== segId
            ? d
            : {
                ...d,
                bullets: d.bullets.map((b) =>
                  b.sourceLevel === "red" || b.gyDecision === "reject"
                    ? b
                    : { ...b, gyDecision: "accept" },
                ),
              },
        ),
      };
      updateCompiledVersion(next);
      return next;
    });
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

  // 本段 JD 要求命中明细（与全局分数同一套判定，右栏块 2 联动）
  const segReqs = activeDec
    ? computeSegmentRequirements(
        activeDec,
        version.jobDescription.requirements ?? [],
        version.requirementMatches,
      )
    : [];

  return (
    <div style={{ position: "relative" }}>
      <style>{`
        .seg:hover { background:#f1f5f9; }
        .gbtn { transition: background-color .15s, border-color .15s, box-shadow .15s, color .15s; } .gbtn:hover { background:#f8fafc; border-color:#cbd5e1; }
        .pbtn { transition: box-shadow .15s, transform .15s; } .pbtn:hover:not(:disabled) { box-shadow:0 6px 18px rgba(79,70,229,.35); transform:translateY(-1px); }
        .bcard { transition: box-shadow .2s, border-color .2s; }
        .bcard:hover { box-shadow:0 3px 12px rgba(15,23,42,.07); }
        .bcard .edit-btn { opacity:0; transition: opacity .15s; }
        .bcard:hover .edit-btn { opacity:1; }
        .expand:hover { color:#4f46e5; }
        .jdrow:hover { background:#f8fafc; }
        .wbcol { overflow-y:auto; }
      `}</style>

      {/* 上下文条：面包屑（公司·职位）+ 线性步骤（当前=编译）。
          完成出口只保留在最后一段（逐段流程的自然终点），顶部不再重复挂按钮。 */}
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
                      // 全部非红已逐条处理（accept 或 reject）→ 批量按钮失效
                      const allProcessed = activeDec.bullets.every((b) => b.sourceLevel === "red" || b.gyDecision != null);
                      return (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, padding: "10px 14px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10 }}>
                          <span style={{ fontSize: 12.5, color: "#94a3b8" }}>{hasRed ? "红色需你单独确认；绿/黄可逐条取舍" : "可逐条取舍，或一键采纳"}</span>
                          <button className="gbtn" onClick={() => acceptAllGreenYellow(activeSeg.id)} disabled={allProcessed}
                            style={{ ...ghostBtn, padding: "6px 12px", fontSize: 12.5, opacity: allProcessed ? 0.5 : 1, cursor: allProcessed ? "default" : "pointer" }}>
                            <CheckCircle2 size={14} color="#059669" /> {allProcessed ? "绿色/黄色已处理" : "采纳全部绿色 / 黄色"}
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
                          isFactList={FACT_LIST_TYPES.has(activeSeg.type)}
                          expanded={!!expanded[bulletKey(activeSeg.id, i)]}
                          editing={editingKey === bulletKey(activeSeg.id, i)}
                          onToggleExpand={() => setExpanded((p) => ({ ...p, [bulletKey(activeSeg.id, i)]: !p[bulletKey(activeSeg.id, i)] }))}
                          onEdit={() => setEditingKey(bulletKey(activeSeg.id, i))}
                          onSaveEdit={(text) => saveEdit(activeSeg.id, i, text)}
                          onConfirmRed={(action) => confirmRed(activeSeg.id, i, action)}
                          onDecideGy={(action) => decideGy(activeSeg.id, i, action)}
                          highlight={highlight}
                        />
                      ))}
                    </div>
                  </>
                )}

                {/* 段落导航 */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 28, paddingTop: 20, borderTop: "1px solid #e2e8f0" }}>
                  <button className="gbtn" onClick={() => go(-1)} disabled={idx === 0} style={{ ...ghostBtn, opacity: idx === 0 ? 0.4 : 1 }}><ArrowLeft size={15} /> 上一段</button>
                  {idx === segments.length - 1 ? (
                    // 最后一段：顺序走完的自然出口，与顶部完成按钮共用 allDone 门控
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      {!allDone && <span style={{ fontSize: 12, color: "#94a3b8" }}>还有 {total - doneCount} 段待处理</span>}
                      <button
                        className="pbtn"
                        onClick={() => allDone && navigate(`/complete/${version.id}`)}
                        disabled={!allDone}
                        style={{ ...primaryBtn, opacity: allDone ? 1 : 0.45, cursor: allDone ? "pointer" : "not-allowed", background: allDone ? primaryBtn.background : "#94a3b8" }}
                      >
                        完成编辑，查看投递版本 <ArrowRight size={15} />
                      </button>
                    </div>
                  ) : (
                    <button className="pbtn" onClick={() => go(1)} style={primaryBtn}>下一段 <ArrowRight size={15} /></button>
                  )}
                </div>
              </>
            ) : (
              <div style={{ color: "#94a3b8", fontSize: 14, paddingTop: 40 }}>这个子版没有可编辑的段落。</div>
            )}
          </div>
        </main>

        {/* 右栏：全局双环评分 + 本段 JD 命中追溯 + 母版事实 */}
        <aside className="wbcol" style={{ borderLeft: "1px solid #e2e8f0", background: "#fff", padding: 22, display: "flex", flexDirection: "column", gap: 22 }}>
          {/* 块1：全局匹配度双环（随采纳实时上涨，不随切段变） */}
          <section>
            <div style={{ ...sideTitle, display: "flex", alignItems: "center", gap: 6, marginBottom: 14 }}><Target size={13} /> 整份简历匹配度</div>
            {score.totalWeight > 0 ? (
              <div style={{ background: "#fafbfc", border: "1px solid #e2e8f0", borderRadius: 16, padding: "20px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14 }}>
                  <Ring value={score.scoreBefore} label="改写前" dim size={72} stroke={7} />
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    <ArrowRight size={18} color="#94a3b8" />
                    {score.delta > 0 && (
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#059669", background: "#d1fae5", padding: "1px 8px", borderRadius: 99 }}>+{score.delta}</span>
                    )}
                  </div>
                  <Ring value={score.scoreNow} label="当前" size={116} stroke={11} />
                </div>
                {/* 定性档位：与分数数字同等醒目的主锚（与完成页一致） */}
                <div style={{ display: "flex", justifyContent: "center", marginTop: 14 }}>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 13px", borderRadius: 99, background: matchTier(score.scoreNow).bg, border: `1px solid ${matchTier(score.scoreNow).border}` }}>
                    <span style={{ width: 7, height: 7, borderRadius: 99, background: matchTier(score.scoreNow).color, flexShrink: 0 }} />
                    <span style={{ fontSize: 14, fontWeight: 600, color: matchTier(score.scoreNow).color }}>{matchTier(score.scoreNow).label}</span>
                  </div>
                </div>
                <div style={{ fontSize: 11.5, color: "#94a3b8", textAlign: "center", marginTop: 12, lineHeight: 1.5 }}>
                  采纳更多改写 / 确认 AI 补充，分数实时上涨
                </div>
                <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 12, fontSize: 10.5, color: "#94a3b8" }}>
                  <Legend c="#e11d48" t="<60" /><Legend c="#d97706" t="60-70" /><Legend c="#059669" t="70-80" /><Legend c="#4f46e5" t="80+" />
                </div>
                <div style={{ fontSize: 11, color: "#94a3b8", textAlign: "center", marginTop: 12, lineHeight: 1.55, borderTop: "1px solid #eef0f5", paddingTop: 12 }}>
                  {MATCH_SCORE_NOTE}
                </div>
              </div>
            ) : (
              <div style={{ background: "#fafbfc", border: "1px solid #e2e8f0", borderRadius: 16, padding: "26px 16px", textAlign: "center", fontSize: 12, color: "#94a3b8", lineHeight: 1.6 }}>
                暂无可量化的 JD 要求 —— 编译未从 JD 提取到要求，无法计算确定性匹配度。
              </div>
            )}
          </section>

          {/* 块2：本段 JD 要求命中追溯（与全局分数同一套判定） */}
          <section style={{ paddingTop: 22, borderTop: "1px solid #f1f5f9" }}>
            <div style={{ ...sideTitle, display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}><Target size={13} /> 本段 JD 要求命中</div>
            {!activeDec?.finalIncluded ? (
              <div style={{ fontSize: 12.5, color: "#94a3b8" }}>本段本次投递隐藏，不参与匹配</div>
            ) : segReqs.length === 0 ? (
              <div style={{ fontSize: 12.5, color: "#94a3b8" }}>本段无对应的 JD 要求</div>
            ) : (
              segReqs.map((r) => (
                <div key={r.phrase} className="jdrow" style={{ padding: 10, borderRadius: 8, marginBottom: 2 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
                    {r.hit ? (
                      <CheckCircle2 size={16} color="#059669" style={{ marginTop: 1, flexShrink: 0 }} />
                    ) : (
                      <AlertCircle size={16} color={r.pending ? "#d97706" : "#cbd5e1"} style={{ marginTop: 1, flexShrink: 0 }} />
                    )}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: r.hit ? "#1e293b" : "#94a3b8", fontWeight: 500, lineHeight: 1.4 }}>{r.phrase}</div>
                      <div style={{ fontSize: 11.5, color: r.hit ? "#059669" : r.pending ? "#d97706" : "#94a3b8", marginTop: 3 }}>
                        {r.hit
                          ? `✅ 由 bullet ${r.byBulletIndex} 命中`
                          : r.pending
                            ? "⚠️ 待确认 AI 补充的 bullet"
                            : "⚠️ 暂未命中"}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </section>

          {/* 块3：母版事实（改写只基于这些事实） */}
          <section style={{ paddingTop: 22, borderTop: "1px solid #f1f5f9" }}>
            <div style={{ ...sideTitle, display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}><Database size={13} /> AI 掌握的事实</div>
            <div style={{ fontSize: 11.5, color: "#94a3b8", marginBottom: 12, lineHeight: 1.5 }}>改写只基于这些事实，不凭空捏造</div>
            {activeSeg ? (
              <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{activeSeg.content}</div>
            ) : (
              <div style={{ fontSize: 12.5, color: "#cbd5e1" }}>—</div>
            )}
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
  /** 所在段是否为事实清单段（教育/技能/证书）——决定"改动状态"标识语义 */
  isFactList: boolean;
  expanded: boolean;
  editing: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onSaveEdit: (text: string) => void;
  onConfirmRed: (action: "accept" | "reject") => void;
  onDecideGy: (action: "accept" | "reject") => void;
  highlight: (text: string, phrases: string[]) => ReactNode;
}

const BulletCard: FC<BulletCardProps> = ({
  b, index, isFactList, expanded, editing, onToggleExpand, onEdit, onSaveEdit, onConfirmRed, onDecideGy, highlight,
}) => {
  const m = SOURCE[b.sourceLevel];
  const Icon = m.icon;
  const isRed = b.sourceLevel === "red";
  const text = b.userEditedText ?? b.rewrittenText;
  const conf = b.redConfirmation;
  const gy = b.gyDecision; // 绿/黄逐条取舍状态
  const gyRejected = !isRed && gy === "reject";

  // ── 改动状态（与🟢🟡🔴来源可信度【正交】：颜色管"信不信"，这里管"动没动"）──
  // 解决绿色被误读：原样保留 ≠ 被改写。判据全用现有数据，不新增字段：
  //   · 事实清单段（教育/技能/证书）→ 产品故意不改写、防注水，明示"原样展示"
  //   · 工作/项目段 AI 判定无需改（rewrittenText==originalText）→ 正反馈"已是最优"
  //   · 工作/项目段确有改写 → "已优化"
  // 红色是"AI 补充"的新内容，由其自带确认流表达，不挂改动状态标识。
  const changeTag = isRed
    ? null
    : isFactList
      ? { icon: ListChecks, label: "事实清单 · 原样展示", color: "#94a3b8" }
      : b.rewrittenText === b.originalText
        ? { icon: ThumbsUp, label: "已是最优 · 原文保留", color: "#64748b" }
        : { icon: Sparkles, label: "已优化", color: "#6366f1" };
  const ChangeIcon = changeTag?.icon;

  return (
    <div className="bcard" style={{ border: `1px solid ${isRed ? m.border : "#e2e8f0"}`, borderLeft: `3px solid ${m.bar}`, borderRadius: 14, background: isRed ? m.soft : "#fff", overflow: "hidden", boxShadow: isRed ? "0 2px 8px rgba(225,29,72,.06)" : "0 1px 3px rgba(15,23,42,.05)" }}>
      <div style={{ padding: "15px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 11 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#cbd5e1" }}>{String(index + 1).padStart(2, "0")}</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: m.soft, border: `1px solid ${m.border}`, padding: "3px 9px", borderRadius: 99 }}>
              <Icon size={13} color={m.dot} /><span style={{ fontSize: 11.5, fontWeight: 600, color: m.text }}>{m.label}</span>
            </span>
            {/* 改动状态：轻量小字（无底色/边框），不与三色 chip 抢视觉 */}
            {changeTag && ChangeIcon && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 3.5, fontSize: 11, fontWeight: 500, color: changeTag.color }} title="信息来源（颜色）之外，单独标注 AI 改没改动这条">
                <ChangeIcon size={12} /> {changeTag.label}
              </span>
            )}
            {!isRed && gy === "accept" && (
              <span style={{ fontSize: 11, color: "#059669", display: "inline-flex", alignItems: "center", gap: 3 }}><Check size={12} /> 已采纳</span>
            )}
            {!isRed && gy === "reject" && (
              <span style={{ fontSize: 11, color: "#94a3b8", display: "inline-flex", alignItems: "center", gap: 3 }}><X size={12} /> 已排除</span>
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
          <div style={{ fontSize: 14.5, lineHeight: 1.7, color: gyRejected ? "#94a3b8" : isRed ? "#9f1239" : "#1e293b", textDecoration: gyRejected ? "line-through" : "none" }}>{highlight(text, b.matchedJdPhrases)}</div>
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
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <span style={{ fontSize: 12.5, color: "#94a3b8", display: "inline-flex", alignItems: "center", gap: 7 }}><X size={15} /> 已排除 — 不写入子版</span>
              <button className="gbtn" onClick={() => onConfirmRed("accept")} style={{ ...rejectBtn, padding: "5px 11px" }}>改为采纳</button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12.5, color: "#047857", display: "inline-flex", alignItems: "center", gap: 7, fontWeight: 500 }}><CheckCircle2 size={15} /> 已采纳 — 将写入子版（建议补充真实细节）</span>
              <button className="gbtn" onClick={() => onConfirmRed("reject")} style={{ ...rejectBtn, padding: "5px 11px" }}>改为排除</button>
            </div>
          )}
        </div>
      )}

      {/* 绿/黄逐条接受/拒绝（对齐红色逐条模式：默认可采纳，可单独说不）*/}
      {!isRed && (
        <div style={{ background: "#fff", borderTop: "1px solid #e2e8f0", padding: "11px 18px" }}>
          {!gy ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12.5, color: "#94a3b8" }}>采纳这条改写，或单独排除</span>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <button className="pbtn" onClick={() => onDecideGy("accept")} style={acceptBtn}><Check size={14} /> 采纳</button>
                <button className="gbtn" onClick={() => onDecideGy("reject")} style={rejectBtn}><X size={14} /> 不要</button>
              </div>
            </div>
          ) : gy === "reject" ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <span style={{ fontSize: 12.5, color: "#94a3b8", display: "inline-flex", alignItems: "center", gap: 7 }}><X size={15} /> 已排除 — 不写入子版</span>
              <button className="gbtn" onClick={() => onDecideGy("accept")} style={{ ...rejectBtn, padding: "5px 11px" }}>改为采纳</button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <span style={{ fontSize: 12.5, color: "#047857", display: "inline-flex", alignItems: "center", gap: 7, fontWeight: 500 }}><CheckCircle2 size={15} /> 已采纳 — 将写入子版</span>
              <button className="gbtn" onClick={() => onDecideGy("reject")} style={{ ...rejectBtn, padding: "5px 11px" }}>改为排除</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ============================ 评分双环 ============================

/** 数字滚动（缓出三次方），用于当前环 */
function CountUp({ to, duration = 1200 }: { to: number; duration?: number }) {
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

/** 进度环：四级分色取自 lib/matchTier（与全站一致）；dim=改写前的灰环 */
function Ring({
  value, size, stroke, label, dim = false,
}: {
  value: number; size: number; stroke: number; label: string; dim?: boolean;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.max(0, Math.min(100, value)) / 100);
  const tier = matchTier(value);
  const col = dim ? "#cbd5e1" : tier.color;
  const colLight = dim ? "#e2e8f0" : tier.light;
  const gid = `wbring_${value}_${dim ? "d" : "n"}_${size}`;
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <defs>
          <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={colLight} />
            <stop offset="100%" stopColor={col} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`url(#${gid})`}
          strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(.22,1,.36,1)" }}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span className="serif" style={{ fontSize: dim ? 20 : 30, fontWeight: 600, color: dim ? "#94a3b8" : col, fontVariantNumeric: "tabular-nums" }}>
          {dim ? value : <CountUp to={value} />}
        </span>
        <span style={{ fontSize: dim ? 9 : 10, color: "#94a3b8", marginTop: -1 }}>{label}</span>
      </div>
    </div>
  );
}

/** 分色图例小点 */
function Legend({ c, t }: { c: string; t: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span style={{ width: 7, height: 7, borderRadius: 99, background: c }} />{t}
    </span>
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

const primaryBtn: CSSProperties = { display: "flex", alignItems: "center", gap: 6, background: "linear-gradient(135deg,#6366f1,#4f46e5)", color: "#fff", border: "none", borderRadius: 9, padding: "9px 17px", fontSize: 13, fontWeight: 600, cursor: "pointer", boxShadow: "0 2px 8px rgba(79,70,229,.25)" };
const ghostBtn: CSSProperties = { display: "flex", alignItems: "center", gap: 6, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 9, padding: "8px 13px", fontSize: 13, color: "#475569", cursor: "pointer" };
const redBtn: CSSProperties = { display: "flex", alignItems: "center", gap: 5, background: "#e11d48", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", boxShadow: "0 1px 3px rgba(225,29,72,.2)" };
const acceptBtn: CSSProperties = { display: "flex", alignItems: "center", gap: 5, background: "#059669", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", boxShadow: "0 1px 3px rgba(5,150,105,.2)" };
const rejectBtn: CSSProperties = { display: "flex", alignItems: "center", gap: 5, background: "#fff", color: "#64748b", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 14px", fontSize: 12.5, fontWeight: 500, cursor: "pointer" };
const navTitle: CSSProperties = { fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".07em", padding: "0 12px 14px" };
const sideTitle: CSSProperties = { fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: ".06em" };
const origLabel: CSSProperties = { fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 };
