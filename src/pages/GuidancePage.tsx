// ============================================================================
// 应届生引导页（Phase 4 · 第一步：交互骨架 + 归集层 + 组装/写入路径）
// ----------------------------------------------------------------------------
// 视觉参考 _refs/ui/guidance_final.jsx：进度条 / 「对应 JD 要求」chip / 大白话
// textarea / 例子 chip 点击填入 / 转 STAR / STAR 结果卡（来源色条）。
//
// 流程（Upload 识别为 C 类 → 带 {company, position, jd} 跳来）：
//   intro     → 填专业/年级（#5 需要），开始
//   questions → 逐题：大白话回答 → 转 STAR bullet → 存入（攒 GuidanceBullet[]）
//   grouping  → 【归集层】把 bullet 归到若干"经历段"，每段由用户填 title/时间/在职态
//   done      → 组装成合法 Master 落盘，引导回首页或直接编译
//
// ⚠️ 第一步只验结构：#5/#6 用本地桩函数（loadQuestionsStub / convertToStarStub）占位，
//    不烧配额。接线缝已标 TODO(Phase4-step2)，第二步替换为真 AI 调用即可。
// 铁律：每段 timeRange + isCurrent 由【用户填】保证非空，绝不让 AI 脑补年限。
// ============================================================================

import { useMemo, useState, type CSSProperties } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Sparkles, ArrowRight, SkipForward, Check, Lightbulb, Target,
  CheckCircle2, ChevronLeft, CircleHelp, Plus, Trash2, AlertCircle,
  Loader2, RotateCw,
} from "lucide-react";
import type { BasicInfo, Master, SegmentType, SourceLevel } from "../types";
import { generateGuidanceQuestions, convertToStar } from "../lib/gemini";
import {
  assembleGuidanceMaster, genLocalId, validateDrafts,
  type GuidanceBullet, type SegmentDraft,
} from "../lib/guidanceIntake";
import { loadStorage, saveStorage } from "../lib/storage";

// ---------------------------------------------------------------------------
// 引导问题（#5 输出投影到本页只用的字段）
// ---------------------------------------------------------------------------

interface GuidanceQuestion {
  /** JD 能力点（#5 的 topic，用 JD 原词）——既作「对应 JD 要求」chip，也作 #6 的 relatedJdRequirement */
  topic: string;
  question: string;
  examples: string[];
}

interface StarResult {
  text: string;
  sourceLevel: SourceLevel;
  missingElements: string[];
}

/** 诚实红线：Phase 4 的 bullet 只整理用户真实回答，绝不渲染/落盘 JD 反写的 red。
 *  #6 偶尔把"STAR 结构缺角"（如用户没说结果）标 red——这类按 yellow(推断) 处理，
 *  缺角已由 missingElements 如实呈现，不会静默写入一条凭空补的 red bullet。 */
function clampSourceLevel(level: SourceLevel): "green" | "yellow" {
  return level === "green" ? "green" : "yellow";
}

// ---------------------------------------------------------------------------
// 经历类型选项（归集时用户选）
// ---------------------------------------------------------------------------

const SEG_TYPE_OPTIONS: Array<{ value: SegmentType; label: string }> = [
  { value: "internship", label: "实习" },
  { value: "project", label: "项目" },
  { value: "activity", label: "社团/活动" },
  { value: "education", label: "教育" },
  { value: "award", label: "获奖" },
  { value: "certificate", label: "证书" },
  { value: "skill", label: "技能" },
  { value: "work", label: "工作" },
  { value: "other", label: "其他" },
];

const SOURCE_STYLE: Record<SourceLevel, { bar: string; bg: string; border: string; color: string; label: string }> = {
  green: { bar: "#059669", bg: "#ecfdf5", border: "#a7f3d0", color: "#047857", label: "直接来源" },
  yellow: { bar: "#d97706", bg: "#fffbeb", border: "#fde68a", color: "#b45309", label: "推断信息" },
  red: { bar: "#e11d48", bg: "#fff1f2", border: "#fecdd3", color: "#be123c", label: "缺失补充" },
};

type Phase = "intro" | "questions" | "grouping" | "done";

export default function GuidancePage() {
  const navigate = useNavigate();
  const ctx = (useLocation().state as
    | { company?: string; position?: string; jd?: string }
    | null) ?? {};

  const [phase, setPhase] = useState<Phase>("intro");

  // intro：#5 需要的用户信息
  const [major, setMajor] = useState("");
  const [grade, setGrade] = useState("应届");

  // 选填 JD（增益非门槛）：预填 Upload 带来的 ctx，用户可改/可清空
  const [company, setCompany] = useState(ctx.company ?? "");
  const [position, setPosition] = useState(ctx.position ?? "");
  const [jd, setJd] = useState(ctx.jd ?? "");

  // questions
  const [questions, setQuestions] = useState<GuidanceQuestion[]>([]);
  const [jdDriven, setJdDriven] = useState(false); // 本轮问题是否由 JD 驱动（决定 chip 文案）
  const [qLoading, setQLoading] = useState(false);
  const [qError, setQError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [sub, setSub] = useState<"ask" | "star">("ask");
  const [answer, setAnswer] = useState("");
  const [star, setStar] = useState<StarResult | null>(null);
  const [starLoading, setStarLoading] = useState(false);
  const [starError, setStarError] = useState<string | null>(null);

  // 攒下的 bullet
  const [bullets, setBullets] = useState<GuidanceBullet[]>([]);

  // grouping
  const [drafts, setDrafts] = useState<SegmentDraft[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // ---------------- intro ----------------

  const hasJd = !!jd.trim();

  async function startQuestions() {
    if (!major.trim() || qLoading) return;
    setPhase("questions");
    setJdDriven(hasJd);
    setQLoading(true);
    setQError(null);
    try {
      const out = await generateGuidanceQuestions({
        // 选填：JD 留空则不传 → #5 走通用经历盘点
        jobDescription: hasJd
          ? { company: company.trim(), position: position.trim(), rawText: jd.trim() }
          : undefined,
        userInfo: { major: major.trim(), grade: grade.trim() || "应届" },
      });
      setQuestions(
        out.questions.map((q) => ({
          topic: q.topic,
          question: q.question,
          examples: q.examples,
        })),
      );
      setStep(0);
      setSub("ask");
      setAnswer("");
      setStar(null);
    } catch (e) {
      console.error("[Guidance] #5 generateGuidanceQuestions failed", e);
      setQError("问题生成失败了，请重试。");
    } finally {
      setQLoading(false);
    }
  }

  // ---------------- questions ----------------

  const q = questions[step];
  const total = questions.length;
  const isLast = step === total - 1;
  const progress = total === 0 ? 0 : ((step + (sub === "star" ? 0.6 : 0.1)) / total) * 100;

  async function toStar() {
    if (!answer.trim() || !q || starLoading) return;
    setStarLoading(true);
    setStarError(null);
    try {
      const out = await convertToStar({
        userAnswer: answer.trim(),
        relatedJdRequirement: q.topic,
        topic: q.topic,
      });
      setStar({
        text: out.starBullet,
        sourceLevel: clampSourceLevel(out.sourceLevel),
        missingElements: out.missingElements,
      });
      setSub("star");
    } catch (e) {
      console.error("[Guidance] #6 convertToStar failed", e);
      setStarError("转换失败了，请重试。");
    } finally {
      setStarLoading(false);
    }
  }

  function advance() {
    setAnswer("");
    setStar(null);
    setStarError(null);
    if (isLast) {
      setPhase("grouping");
    } else {
      setStep((s) => s + 1);
      setSub("ask");
    }
  }

  function acceptStar() {
    if (!q || !star) return;
    setBullets((prev) => [
      ...prev,
      {
        id: genLocalId("gb"),
        topic: q.topic,
        text: star.text,
        sourceLevel: star.sourceLevel,
        missingElements: star.missingElements,
      },
    ]);
    advance();
  }

  function skip() {
    advance();
  }

  // ---------------- grouping ----------------

  function addDraft() {
    setDrafts((prev) => [
      ...prev,
      {
        id: genLocalId("draft"),
        type: "internship",
        title: "",
        timeRange: { start: "", end: "" },
        isCurrent: false,
        bulletIds: [],
      },
    ]);
  }

  function removeDraft(id: string) {
    setDrafts((prev) => prev.filter((d) => d.id !== id));
  }

  function patchDraft(id: string, patch: Partial<SegmentDraft>) {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }

  // 一条 bullet 单一归属：勾到某段时，先从其它段移除
  function toggleBulletIn(draftId: string, bulletId: string) {
    setDrafts((prev) =>
      prev.map((d) => {
        if (d.id === draftId) {
          const has = d.bulletIds.includes(bulletId);
          return {
            ...d,
            bulletIds: has
              ? d.bulletIds.filter((b) => b !== bulletId)
              : [...d.bulletIds, bulletId],
          };
        }
        // 其它段移除该 bullet（保证单一归属）
        return d.bulletIds.includes(bulletId)
          ? { ...d, bulletIds: d.bulletIds.filter((b) => b !== bulletId) }
          : d;
      }),
    );
  }

  const assignedIds = useMemo(
    () => new Set(drafts.flatMap((d) => d.bulletIds)),
    [drafts],
  );
  const unassigned = bullets.filter((b) => !assignedIds.has(b.id));
  const draftErrors = useMemo(() => validateDrafts(drafts), [drafts]);
  const errorByDraft = useMemo(
    () => new Map(draftErrors.map((e) => [e.draftId, e.missing])),
    [draftErrors],
  );

  const canFinish =
    drafts.length > 0 &&
    draftErrors.length === 0 &&
    !!name.trim();

  function persistMaster(m: Master) {
    const store = loadStorage();
    saveStorage({ ...store, master: m });
  }

  function finish() {
    if (!canFinish) return;
    const basicInfo: BasicInfo = {
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
    };
    const master = assembleGuidanceMaster({ basicInfo, drafts, bullets });
    persistMaster(master);
    setPhase("done");
  }

  // ---------------- 渲染 ----------------

  const jdLabel = `${company || "目标公司"} · ${position || "目标岗位"}`;

  return (
    <div style={wrap}>
      <style>{`
        .serif { font-family: 'Fraunces', Georgia, serif; }
        .card { background:#fff; border:1px solid #e2e8f0; border-radius:16px; box-shadow: 0 1px 2px -1px rgb(15 23 42/.08), 0 4px 12px -2px rgb(15 23 42/.06); }
        .gbtn { transition: background-color .15s, border-color .15s, box-shadow .15s, color .15s; } .gbtn:hover { background:#f8fafc; border-color:#cbd5e1; }
        .pbtn { transition: box-shadow .15s, transform .15s; } .pbtn:hover:not(:disabled) { box-shadow: 0 6px 18px rgba(79,70,229,.35); transform: translateY(-1px); }
        .ex:hover { border-color:#c7d2fe; background:#f5f3ff; color:#4338ca; }
        textarea:focus, input:focus, select:focus { border-color:#a5b4fc; outline:none; }
        @keyframes fadeUp { from { opacity:0; transform: translateY(8px) } to { opacity:1; transform: translateY(0) } }
        @keyframes spin { to { transform: rotate(360deg); } }
        .anim { animation: fadeUp .3s ease; }
      `}</style>

      {/* 进度条（仅问答阶段） */}
      {phase === "questions" && (
        <div style={{ marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 13 }}>
          <span style={{ color: "#94a3b8" }}>已收集 <b style={{ color: "#059669", fontWeight: 600 }}>{bullets.length}</b> 条</span>
          <span style={{ color: "#4f46e5", fontWeight: 600 }}>第 {step + 1} / {total} 题</span>
        </div>
      )}
      {phase === "questions" && (
        <div style={{ height: 5, background: "#eef0f5", borderRadius: 99, overflow: "hidden", marginBottom: 28 }}>
          <div style={{ height: "100%", width: `${progress}%`, background: "linear-gradient(90deg,#6366f1,#4f46e5)", borderRadius: 99, transition: "width .4s cubic-bezier(.22,1,.36,1)" }} />
        </div>
      )}

      {/* ---------------- intro ---------------- */}
      {phase === "intro" && (
        <div className="anim">
          <div style={{ display: "flex", gap: 10, fontSize: 12.5, color: "#6366f1", background: "#eef2ff", padding: "11px 14px", borderRadius: 11, marginBottom: 22, lineHeight: 1.55 }}>
            <Lightbulb size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            AI 会带你做经历盘点，用大白话回答即可，帮你攒成一份简历母版。公司与时间你自己填，AI 不替你编造。
          </div>
          <div className="serif" style={{ fontSize: 24, fontWeight: 600, marginBottom: 20 }}>先告诉我们一点你的背景</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 420 }}>
            <label style={fieldLabel}>专业
              <input value={major} onChange={(e) => setMajor(e.target.value)} placeholder="如 金融学 / 计算机" style={inputStyle} />
            </label>
            <label style={fieldLabel}>年级
              <input value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="如 应届 / 大四 / 研二" style={inputStyle} />
            </label>
          </div>

          {/* 选填 JD（增益非门槛） */}
          <div className="card" style={{ padding: 18, marginTop: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13.5, fontWeight: 600, color: "#334155", marginBottom: 6 }}>
              <Target size={14} color="#6366f1" /> 目标岗位 JD <span style={{ fontSize: 12, fontWeight: 500, color: "#94a3b8" }}>（选填）</span>
            </div>
            <div style={{ fontSize: 12.5, color: "#94a3b8", lineHeight: 1.55, marginBottom: 12 }}>
              填入目标岗位 JD，提问会更贴合岗位要求；不填也可直接开始，AI 会按经历类型帮你系统盘点。引导只为攒母版，正式编译的 JD 之后再输。
            </div>
            <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
              <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="公司（选填）" style={inputStyle} />
              <input value={position} onChange={(e) => setPosition(e.target.value)} placeholder="职位（选填）" style={inputStyle} />
            </div>
            <textarea value={jd} onChange={(e) => setJd(e.target.value)} placeholder="粘贴目标岗位 JD…（选填，留空则做通用经历盘点）"
              style={{ ...textareaStyle, minHeight: 90 }} />
          </div>

          <button className="pbtn" disabled={!major.trim()} onClick={startQuestions}
            style={{ ...primaryBtn, marginTop: 24, opacity: major.trim() ? 1 : 0.45, cursor: major.trim() ? "pointer" : "not-allowed" }}>
            {hasJd ? "按 JD 开始引导" : "开始通用盘点"} <ArrowRight size={15} />
          </button>
        </div>
      )}

      {/* ---------------- questions：#5 加载态 / 错误态 ---------------- */}
      {phase === "questions" && questions.length === 0 && (
        <div className="anim" style={{ textAlign: "center", padding: "60px 0" }}>
          {qLoading ? (
            <>
              <Loader2 size={28} color="#4f46e5" className="spin" style={{ animation: "spin 1s linear infinite" }} />
              <div style={{ fontSize: 14, color: "#475569", fontWeight: 500, marginTop: 14 }}>正在生成引导问题…</div>
              <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 5 }}>{jdDriven ? `结合「${jdLabel}」的要求，稍候片刻` : "按经历类型为你系统盘点，稍候片刻"}</div>
            </>
          ) : qError ? (
            <>
              <AlertCircle size={26} color="#e11d48" />
              <div style={{ fontSize: 13.5, color: "#e11d48", marginTop: 12 }}>{qError}</div>
              <button className="gbtn" onClick={startQuestions} style={{ ...ghostBtn, margin: "16px auto 0" }}>
                <RotateCw size={14} /> 重试
              </button>
            </>
          ) : null}
        </div>
      )}

      {/* ---------------- questions ---------------- */}
      {phase === "questions" && q && (
        <div key={step + sub} className="anim">
          <div style={chip}><Target size={12} /> {jdDriven ? "对应 JD 要求" : "经历盘点"}：{q.topic}</div>
          <div className="serif" style={{ fontSize: 23, fontWeight: 600, lineHeight: 1.45, marginBottom: 18 }}>{q.question}</div>

          {sub === "ask" ? (
            <>
              <div style={{ fontSize: 12.5, color: "#94a3b8", marginBottom: 10 }}>比如这些场景（点击可填入）：</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
                {q.examples.map((ex) => (
                  <button key={ex} className="ex" onClick={() => setAnswer((a) => (a ? a : ex))}
                    style={exChip}>{ex}</button>
                ))}
              </div>
              <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="用你自己的话说说就行，不用写得正式…" autoFocus
                style={textareaStyle} />
              {starError && (
                <div style={{ marginTop: 12, fontSize: 12.5, color: "#e11d48", background: "#fff1f2", border: "1px solid #fecdd3", padding: "9px 12px", borderRadius: 9 }}>
                  {starError}
                </div>
              )}
              <div style={rowBetween}>
                <button className="gbtn" onClick={skip} disabled={starLoading} style={{ ...ghostBtn, color: "#94a3b8", border: "none", padding: "8px 4px", opacity: starLoading ? 0.5 : 1, cursor: starLoading ? "not-allowed" : "pointer" }}>
                  <SkipForward size={14} /> 这条跳过
                </button>
                <button className="pbtn" onClick={toStar} disabled={!answer.trim() || starLoading}
                  style={{ ...primaryBtn, opacity: answer.trim() && !starLoading ? 1 : 0.45, cursor: answer.trim() && !starLoading ? "pointer" : "not-allowed" }}>
                  {starLoading
                    ? <><Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> 转换中…</>
                    : <><Sparkles size={15} /> {starError ? "重试转换" : "转成简历语言"}</>}
                </button>
              </div>
            </>
          ) : star ? (
            <>
              <div style={{ fontSize: 12.5, color: "#94a3b8", marginBottom: 12 }}>AI 把你的回答转成了简历 bullet：</div>
              <div className="card" style={{ padding: 18, borderLeft: `3px solid ${SOURCE_STYLE[star.sourceLevel].bar}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: SOURCE_STYLE[star.sourceLevel].bg, border: `1px solid ${SOURCE_STYLE[star.sourceLevel].border}`, padding: "3px 9px", borderRadius: 99 }}>
                    <CircleHelp size={13} color={SOURCE_STYLE[star.sourceLevel].bar} />
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: SOURCE_STYLE[star.sourceLevel].color }}>{SOURCE_STYLE[star.sourceLevel].label}</span>
                  </span>
                  <span style={{ fontSize: 11.5, color: "#94a3b8" }}>基于你的描述整理，请核对</span>
                </div>
                <div style={{ fontSize: 14.5, lineHeight: 1.7, color: "#1e293b" }}>{star.text}</div>
                {star.missingElements.length > 0 && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #f1f5f9", fontSize: 12.5, color: "#64748b" }}>
                    <b style={{ fontWeight: 600, color: "#475569" }}>建议补充 </b>{star.missingElements.join("、")}
                  </div>
                )}
              </div>
              <div style={rowBetween}>
                <button className="gbtn" onClick={() => setSub("ask")} style={{ ...ghostBtn, color: "#64748b" }}>
                  <ChevronLeft size={14} /> 改改回答
                </button>
                <button className="pbtn" onClick={acceptStar} style={{ ...primaryBtn }}>
                  {isLast ? <><CheckCircle2 size={15} /> 存好，去归集经历</> : <><Check size={15} /> 存好，下一题</>}
                </button>
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* ---------------- grouping（归集层） ---------------- */}
      {phase === "grouping" && (
        <div className="anim">
          <div className="serif" style={{ fontSize: 24, fontWeight: 600, marginBottom: 8 }}>把这些内容归到你的经历里</div>
          <div style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.6, marginBottom: 22 }}>
            你攒了 {bullets.length} 条内容。请按"哪段经历"把它们分组，并填上公司/项目、起止时间——
            <b style={{ color: "#b45309" }}>时间与归属由你填，AI 不替你编造</b>。
          </div>

          {/* 基本信息 */}
          <div className="card" style={{ padding: 18, marginBottom: 18 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: "#334155", marginBottom: 12 }}>基本信息</div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <label style={{ ...fieldLabel, flex: 1, minWidth: 140 }}>姓名 *
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="必填" style={inputStyle} />
              </label>
              <label style={{ ...fieldLabel, flex: 1, minWidth: 140 }}>邮箱
                <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="选填" style={inputStyle} />
              </label>
              <label style={{ ...fieldLabel, flex: 1, minWidth: 140 }}>电话
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="选填" style={inputStyle} />
              </label>
            </div>
          </div>

          {/* 未归类提示 */}
          {unassigned.length > 0 && (
            <div style={{ display: "flex", gap: 8, fontSize: 12.5, color: "#b45309", background: "#fffbeb", border: "1px solid #fde68a", padding: "10px 14px", borderRadius: 10, marginBottom: 16, lineHeight: 1.5 }}>
              <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              还有 {unassigned.length} 条内容未归类（不归类则不会写入母版）：{unassigned.map((b) => b.topic).join("、")}
            </div>
          )}

          {/* 经历段卡片 */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {drafts.map((d, i) => {
              const missing = errorByDraft.get(d.id);
              return (
                <div key={d.id} className="card" style={{ padding: 18 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#4338ca", background: "#eef2ff", border: "1px solid #e0e7ff", padding: "3px 10px", borderRadius: 99 }}>第 {i + 1} 段</span>
                    <select value={d.type} onChange={(e) => patchDraft(d.id, { type: e.target.value as SegmentType })} style={{ ...inputStyle, width: "auto", padding: "7px 10px" }}>
                      {SEG_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <button onClick={() => removeDraft(d.id)} style={{ marginLeft: "auto", border: "none", background: "transparent", cursor: "pointer", padding: 4 }} title="删除这段">
                      <Trash2 size={15} color="#94a3b8" />
                    </button>
                  </div>

                  <input value={d.title} onChange={(e) => patchDraft(d.id, { title: e.target.value })}
                    placeholder="标题：公司 / 项目 / 学校 / 组织（必填）" style={{ ...inputStyle, marginBottom: 12, fontWeight: 500 }} />

                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
                    <span style={{ fontSize: 12, color: "#94a3b8" }}>时间</span>
                    <input value={d.timeRange.start} onChange={(e) => patchDraft(d.id, { timeRange: { ...d.timeRange, start: e.target.value } })}
                      placeholder="YYYY-MM" style={{ ...inputStyle, width: 100 }} />
                    <span style={{ color: "#cbd5e1" }}>~</span>
                    <input value={d.isCurrent ? "present" : d.timeRange.end} disabled={d.isCurrent}
                      onChange={(e) => patchDraft(d.id, { timeRange: { ...d.timeRange, end: e.target.value } })}
                      placeholder="YYYY-MM" style={{ ...inputStyle, width: 100, opacity: d.isCurrent ? 0.5 : 1 }} />
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "#475569", cursor: "pointer" }}>
                      <input type="checkbox" checked={d.isCurrent}
                        onChange={(e) => patchDraft(d.id, { isCurrent: e.target.checked, timeRange: { ...d.timeRange, end: e.target.checked ? "present" : (d.timeRange.end === "present" ? "" : d.timeRange.end) } })} />
                      在职 / 进行中
                    </label>
                  </div>

                  {/* bullet 归属 */}
                  <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8 }}>勾选属于这段经历的内容：</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {bullets.map((b) => {
                      const checked = d.bulletIds.includes(b.id);
                      return (
                        <label key={b.id} style={{ display: "flex", gap: 9, alignItems: "flex-start", fontSize: 13, color: "#334155", cursor: "pointer", padding: "8px 10px", borderRadius: 9, border: `1px solid ${checked ? "#c7d2fe" : "#eef2f7"}`, background: checked ? "#f5f3ff" : "#fcfcfd" }}>
                          <input type="checkbox" checked={checked} onChange={() => toggleBulletIn(d.id, b.id)} style={{ marginTop: 3 }} />
                          <span style={{ flex: 1, lineHeight: 1.5 }}>
                            <span style={{ fontSize: 11, color: "#6366f1", marginRight: 6 }}>[{b.topic}]</span>{b.text}
                          </span>
                        </label>
                      );
                    })}
                  </div>

                  {missing && (
                    <div style={{ marginTop: 10, fontSize: 12, color: "#e11d48" }}>缺：{missing.join("、")}</div>
                  )}
                </div>
              );
            })}
          </div>

          <button className="gbtn" onClick={addDraft} style={{ ...ghostBtn, marginTop: 14, width: "100%", justifyContent: "center", padding: "11px 0" }}>
            <Plus size={15} /> 新增一段经历
          </button>

          <div style={{ ...rowBetween, marginTop: 24 }}>
            <span style={{ fontSize: 12.5, color: "#94a3b8" }}>
              {drafts.length === 0 ? "至少建立一段经历" : !name.trim() ? "请填写姓名" : draftErrors.length > 0 ? "有经历段信息未填全" : "可以生成母版了"}
            </span>
            <button className="pbtn" onClick={finish} disabled={!canFinish}
              style={{ ...primaryBtn, opacity: canFinish ? 1 : 0.45, cursor: canFinish ? "pointer" : "not-allowed" }}>
              <CheckCircle2 size={15} /> 生成母版并完成
            </button>
          </div>
        </div>
      )}

      {/* ---------------- done ---------------- */}
      {phase === "done" && (
        <div className="anim" style={{ textAlign: "center", padding: "40px 0" }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: "#ecfdf5", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 18 }}>
            <CheckCircle2 size={28} color="#059669" />
          </div>
          <div className="serif" style={{ fontSize: 26, fontWeight: 600, marginBottom: 10 }}>母版已建立</div>
          <div style={{ fontSize: 13.5, color: "#94a3b8", lineHeight: 1.6, maxWidth: 440, margin: "0 auto 28px" }}>
            你的经历已攒成一份完整母版（含公司与时间）。之后可针对任意岗位编译投递版，无需重复填写。
          </div>
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <button className="gbtn" onClick={() => navigate("/")} style={{ ...ghostBtn, padding: "11px 20px" }}>返回首页</button>
            {hasJd && (
              <button className="pbtn" onClick={() => navigate("/compile", { state: { company, position, jd } })} style={{ ...primaryBtn }}>
                <Sparkles size={15} /> 立即编译该岗位
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------- styles ----------------

const wrap: CSSProperties = { maxWidth: 660, margin: "0 auto", padding: "32px 24px 80px" };
const chip: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 600, color: "#4f46e5", background: "#eef2ff", border: "1px solid #e0e7ff", padding: "4px 11px", borderRadius: 99, marginBottom: 16 };
const exChip: CSSProperties = { fontSize: 12.5, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 99, padding: "7px 13px", color: "#64748b", cursor: "pointer", transition: "border-color .15s, background-color .15s, color .15s" };
const textareaStyle: CSSProperties = { width: "100%", minHeight: 116, border: "1px solid #e2e8f0", borderRadius: 12, padding: 14, fontSize: 14, lineHeight: 1.6, color: "#1e293b", resize: "vertical" };
const rowBetween: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 18 };
const fieldLabel: CSSProperties = { display: "flex", flexDirection: "column", gap: 6, fontSize: 12.5, color: "#64748b", fontWeight: 500 };
const inputStyle: CSSProperties = { width: "100%", border: "1px solid #e2e8f0", borderRadius: 10, padding: "9px 11px", fontSize: 13.5, color: "#1e293b", background: "#fff" };
const primaryBtn: CSSProperties = { display: "flex", alignItems: "center", gap: 6, background: "linear-gradient(135deg,#6366f1,#4f46e5)", color: "#fff", border: "none", borderRadius: 10, padding: "11px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer" };
const ghostBtn: CSSProperties = { display: "flex", alignItems: "center", gap: 5, background: "transparent", border: "1px solid #e2e8f0", borderRadius: 10, padding: "9px 14px", fontSize: 13, color: "#475569", cursor: "pointer" };
