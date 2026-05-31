import React, { useState, useEffect, useRef } from "react";
import {
  FileText, Check, X, ChevronRight, ChevronDown, CheckCircle2, CircleHelp, CircleAlert,
  AlertCircle, Database, Pencil, Globe, Target, Eye, Sparkles, ArrowRight, ArrowLeft, Info
} from "lucide-react";

const scoreColor = (s) => s < 60 ? "#e11d48" : s < 70 ? "#d97706" : s < 80 ? "#059669" : "#4f46e5";
const scoreColorLight = (s) => s < 60 ? "#fb7185" : s < 70 ? "#fbbf24" : s < 80 ? "#34d399" : "#6366f1";

const SOURCE = {
  direct:   { dot: "#059669", text: "#047857", soft: "#ecfdf5", border: "#a7f3d0", bar: "#059669", icon: CheckCircle2, label: "基于原文" },
  inferred: { dot: "#d97706", text: "#b45309", soft: "#fffbeb", border: "#fde68a", bar: "#d97706", icon: CircleHelp, label: "推断信息" },
  added:    { dot: "#e11d48", text: "#be123c", soft: "#fff1f2", border: "#fecdd3", bar: "#e11d48", icon: CircleAlert, label: "AI 补充" },
};

function CountUp({ to, duration = 1200 }) {
  const [v, setV] = useState(0);
  const ref = useRef();
  useEffect(() => {
    let start;
    const step = (t) => {
      if (!start) start = t;
      const p = Math.min((t - start) / duration, 1);
      setV(Math.round((1 - Math.pow(1 - p, 3)) * to));
      if (p < 1) ref.current = requestAnimationFrame(step);
    };
    ref.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(ref.current);
  }, [to, duration]);
  return <>{v}</>;
}

function Ring({ value, size, stroke, label, dim = false }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - value / 100);
  const col = dim ? "#cbd5e1" : scoreColor(value);
  const colLight = dim ? "#e2e8f0" : scoreColorLight(value);
  const gid = `g${value}${dim ? "d" : ""}${size}`;
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <defs><linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor={colLight} /><stop offset="100%" stopColor={col} /></linearGradient></defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`url(#${gid})`} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset} style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(.22,1,.36,1)" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span className="serif" style={{ fontSize: dim ? 20 : 30, fontWeight: 600, color: dim ? "#94a3b8" : col, fontVariantNumeric: "tabular-nums" }}>{dim ? value : <CountUp to={value} />}</span>
        <span style={{ fontSize: dim ? 9 : 10, color: "#94a3b8", marginTop: -1 }}>{label}</span>
      </div>
    </div>
  );
}

const SECTIONS = [
  { id: "personal", nav: "个人信息", type: "基础信息", status: "done", simple: true },
  { id: "education", nav: "教育背景", type: "学历信息", status: "done", simple: true },
  {
    id: "copilot", nav: "AI Resume Copilot", type: "个人项目 · 2024", status: "current",
    original: "独立开发 AI 简历优化工具，使用 React 和 TypeScript，接入 Gemini API，已部署上线，支持简历与 JD 的智能匹配分析。",
    scoreBefore: 65, scoreAfter: 82,
    bullets: [
      { id: "c1", index: "01", kind: "direct", text: "独立开发并上线 AI 产品落地工具，基于 React + TypeScript 构建前端工程。", highlights: ["AI 产品", "React", "产品落地"], change: "将“开发工具”强化为“AI 产品落地”", reason: "JD 强调 AI 产品方向，原文已含全部事实，仅调整表述", keywords: ["AI产品", "React", "产品落地"] },
      { id: "c2", index: "02", kind: "inferred", text: "接入 Gemini 大模型 API，设计结构化 Prompt 实现简历与 JD 的智能匹配。", highlights: ["大模型", "Prompt"], change: "补充“结构化 Prompt 设计”", reason: "原文提到接入 Gemini，Prompt 工程是合理推断", keywords: ["大模型", "Prompt"] },
      { id: "c3", index: "03", kind: "added", text: "建立大模型输出质量评估体系，通过 A/B 对比持续迭代优化 Prompt。", highlights: ["评估体系", "A/B"], change: "新增“质量评估体系”经历", reason: "JD 要求建立评估体系，母版未提及，需确认", keywords: ["评估体系", "A/B"] },
    ],
    jd: [
      { id: "j1", label: "AI 产品方向落地经验", hit: "c1", words: "AI产品、产品落地", weight: 2 },
      { id: "j2", label: "大模型 / Prompt 工程能力", hit: "c2", words: "大模型、Prompt", weight: 2 },
      { id: "j3", label: "建立效果评估体系", hit: "c3", words: "评估体系、A/B", conditional: true, weight: 1.5 },
      { id: "j4", label: "前端工程能力（React）", hit: "c1", words: "React", weight: 1 },
    ],
    facts: ["React + TypeScript 开发", "接入 Gemini API", "已部署上线", "简历与 JD 匹配分析"],
  },
  {
    id: "haisheng", nav: "海晟佛山金融租赁", type: "资产管理 · 2023", status: "todo",
    original: "在海晟佛山金融租赁负责资产管理相关工作，参与多个租赁项目的尽职调查与风险评估，协助完成项目放款流程。",
    scoreBefore: 41, scoreAfter: 54,
    bullets: [
      { id: "h1", index: "01", kind: "direct", text: "主导多个融资租赁项目尽职调查，覆盖资产评估与风险识别全流程。", highlights: ["尽职调查", "风险识别"], change: "“参与”升级为“主导”", reason: "原文含尽调事实，调整表述强度", keywords: ["尽职调查", "风险评估"] },
      { id: "h2", index: "02", kind: "inferred", text: "协同业务与风控团队推进放款审批，缩短项目交付周期。", highlights: ["放款审批", "跨团队"], change: "补充跨团队协同与提效", reason: "原文提及放款流程，协同为合理推断", keywords: ["放款", "跨团队"] },
      { id: "h3", index: "03", kind: "added", text: "搭建租赁项目风险量化模型，提升资产组合风险预警能力。", highlights: ["风险量化模型"], change: "新增风险量化模型经历", reason: "JD 要求量化风控，母版未提及，需确认", keywords: ["量化模型"] },
    ],
    jd: [
      { id: "j1", label: "融资租赁尽调经验", hit: "h1", words: "尽职调查", weight: 2 },
      { id: "j2", label: "风险评估与风控", hit: "h1", words: "风险识别", weight: 1.5 },
      { id: "j3", label: "量化风控模型", hit: "h3", words: "量化模型", conditional: true, weight: 1.5 },
      { id: "j4", label: "跨部门协同推进", hit: "h2", words: "跨团队", weight: 1 },
    ],
    facts: ["金融租赁资产管理", "项目尽职调查", "风险评估", "放款流程协助"],
  },
  {
    id: "guoyuan", nav: "国元证券", type: "投行部实习 · 2022", status: "todo",
    original: "在国元证券实习，参与投行部 IPO 项目材料整理，协助撰写招股说明书部分章节，跟进项目反馈意见回复。",
    scoreBefore: 50, scoreAfter: 61,
    bullets: [
      { id: "g1", index: "01", kind: "direct", text: "参与 IPO 项目全流程，独立完成招股说明书多个章节撰写。", highlights: ["IPO", "招股说明书"], change: "“协助撰写”明确为“独立完成”", reason: "原文含撰写事实，仅明确独立性", keywords: ["IPO", "招股说明书"] },
      { id: "g2", index: "02", kind: "inferred", text: "梳理反馈意见并协调中介机构高效回复，保障项目申报进度。", highlights: ["反馈意见", "申报进度"], change: "补充协调中介与提效", reason: "原文含跟进反馈，协调为合理推断", keywords: ["反馈回复", "中介协调"] },
      { id: "g3", index: "03", kind: "added", text: "独立搭建 IPO 项目财务数据底稿，提升尽调数据复核效率。", highlights: ["财务数据底稿"], change: "新增财务底稿搭建经历", reason: "JD 要求财务分析，母版未明确，需确认", keywords: ["财务底稿"] },
    ],
    jd: [
      { id: "j1", label: "IPO 项目经验", hit: "g1", words: "IPO、招股说明书", weight: 2 },
      { id: "j2", label: "招股书撰写能力", hit: "g1", words: "招股说明书", weight: 1.5 },
      { id: "j3", label: "财务分析能力", hit: "g3", words: "财务底稿", conditional: true, weight: 1.5 },
      { id: "j4", label: "项目沟通协调", hit: "g2", words: "中介协调", weight: 1 },
    ],
    facts: ["投行部 IPO 实习", "招股说明书撰写", "反馈意见跟进", "项目材料整理"],
  },
  { id: "skills", nav: "技能与证书", type: "技能信息", status: "todo", simple: true },
];

const SIMPLE_DATA = {
  personal: { note: "姓名、联系方式等基础信息已确认，无需 AI 改写。", facts: ["姓名 张明", "所在城市 上海", "联系方式完整", "求职意向 AI 产品经理"] },
  education: { note: "学历信息客观且已核对，AI 不会改写事实性内容。", facts: ["复旦大学 金融学硕士", "上海财经大学 学士", "GPA 3.8/4.0", "在校获奖学金"] },
  skills: { note: "技能与证书为客观清单，AI 仅按 JD 排序、不编造证书。", facts: ["SQL / Python", "数据分析", "CFA 一级", "证券从业资格"] },
};

const ORDER = SECTIONS.map((s) => s.id);

/*
 * 开发注记（本 artifact 未实现，开发时补）：
 * - 加载态：AI 分析中复用 V1.0 的 loading 动画（AnalysisLoading）
 * - 错误态：Gemini 调用失败时的重试提示
 * - 空状态：某段无 bullet 时的占位
 * - 移动端：桌面三栏，窄屏显示"请用电脑访问"兜底页
 */
export default function Workbench() {
  const [activeId, setActiveId] = useState("copilot");
  const [adopted, setAdopted] = useState({});
  const [editing, setEditing] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [expanded, setExpanded] = useState({}); // 改动说明折叠状态 #2

  const idx = ORDER.indexOf(activeId);
  const sec = SECTIONS.find((s) => s.id === activeId);
  const doneCount = SECTIONS.filter((s) => s.status === "done").length;
  const total = SECTIONS.length;
  const remaining = total - doneCount; // #5
  const allDone = remaining === 0;

  const go = (delta) => {
    const ni = Math.max(0, Math.min(ORDER.length - 1, idx + delta));
    setActiveId(ORDER[ni]); setEditing(null); setShowPreview(false);
  };

  const highlight = (text, hl) => {
    if (!hl?.length) return text;
    const re = new RegExp(`(${hl.map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g");
    return text.split(re).map((part, i) => hl.includes(part)
      ? <span key={i} style={{ borderBottom: "2px solid #6366f1", color: "#4338ca", fontWeight: 600, paddingBottom: 1 }}>{part}</span>
      : part);
  };

  const acceptedBullets = sec?.bullets?.filter((b) => b.kind !== "added" || adopted[b.id] === true) || [];

  // ===== 全局匹配度计算（加权命中率：Hard 2x / Title 1.5x / Context 1x）=====
  // 收集所有段落的全部 JD 要求 + 改写前已命中的（非 added 默认命中；added 需采纳）
  const scoreSection = SECTIONS.filter((s) => !s.simple);
  let totalWeight = 0, hitWeightBefore = 0, hitWeightNow = 0;
  scoreSection.forEach((s) => {
    s.jd.forEach((r) => {
      const w = r.weight || 1;
      totalWeight += w;
      const hb = s.bullets.find((b) => b.id === r.hit);
      // 改写前：只有非补充类、且 conditional=false 的算原本就命中（简化模型）
      if (hb && hb.kind === "direct" && !r.conditional) hitWeightBefore += w;
      // 当前：绿黄默认命中；红色(added)需用户采纳
      const met = hb && (hb.kind !== "added" || adopted[hb.id] === true);
      if (met) hitWeightNow += w;
    });
  });
  // 基础分锚定 65（改写前），随采纳从 hitWeightBefore 涨向 hitWeightNow
  const GLOBAL_BEFORE = 65;
  // 改写后满分（全采纳）对应的分数上限，按命中权重比例线性映射到 65~95 区间
  const ratioNow = totalWeight ? hitWeightNow / totalWeight : 0;
  const ratioBefore = totalWeight ? hitWeightBefore / totalWeight : 0;
  // 映射：把 ratio 从 [ratioBefore, 1] 映射到 [65, 95]
  const span = 95 - GLOBAL_BEFORE;
  const globalNow = Math.round(
    GLOBAL_BEFORE + (ratioBefore < 1 ? (ratioNow - ratioBefore) / (1 - ratioBefore) : 0) * span
  );
  const globalScore = Math.max(GLOBAL_BEFORE, Math.min(95, globalNow));

  return (
    <div style={{ fontFamily: "'IBM Plex Sans',system-ui,sans-serif", background: "#f8fafc", color: "#1e293b" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=IBM+Plex+Sans:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        .serif { font-family: 'Fraunces', Georgia, serif; }
        .seg:hover { background: #f1f5f9; }
        .gbtn { transition: all .15s; }
        .gbtn:hover { background: #f8fafc; border-color: #cbd5e1; }
        .bcard { transition: box-shadow .2s, border-color .2s; }
        .bcard:hover { box-shadow: 0 3px 12px rgba(15,23,42,.07); }
        .bcard .edit-btn { opacity: 0; transition: opacity .15s; }   /* #7 hover 才显现编辑 */
        .bcard:hover .edit-btn { opacity: 1; }
        .pbtn { transition: all .15s; }
        .pbtn:hover:not(:disabled) { box-shadow: 0 6px 18px rgba(79,70,229,.35); transform: translateY(-1px); }
        .jdrow:hover { background: #f8fafc; }
        .expand:hover { color: #4f46e5; }
        .wb { overflow-x: auto; }
        @keyframes mFade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes mPop { from { opacity: 0; transform: scale(.96) translateY(8px) } to { opacity: 1; transform: scale(1) translateY(0) } }
        .m-backdrop { animation: mFade .2s ease; }
        .m-dialog { animation: mPop .26s cubic-bezier(.22,1,.36,1); }
        .m-close:hover { background: rgba(255,255,255,.1); }
        .m-link:hover { color: #fff; }
        .shadow-soft { box-shadow: 0 1px 2px -1px rgb(15 23 42/.08), 0 4px 12px -2px rgb(15 23 42/.06); }
      `}</style>

      <div className="wb">
        <div style={{ minWidth: 1140, position: "relative" }}>
          <div style={{ position: "absolute", top: 0, left: "30%", width: 700, height: 320, background: "radial-gradient(60% 50% at 50% 0%, rgba(99,102,241,.08), transparent 70%)", pointerEvents: "none", zIndex: 0 }} />

          {/* 统一 Header：固定区(logo可点击回首页) + 上下文区(面包屑+步骤条) + 操作区(中/EN全局 + 完成编译) */}
          <header style={{ height: 64, borderBottom: "1px solid #e2e8f0", background: "rgba(255,255,255,.85)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 28px", position: "relative", zIndex: 2 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              {/* logo 可点击回首页（开发时绑定路由 → /resume）*/}
              <div title="返回首页" style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                <div style={{ width: 32, height: 32, background: "linear-gradient(135deg,#6366f1,#4f46e5)", borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(79,70,229,.3)" }}><FileText size={17} color="#fff" /></div>
                <span className="serif" style={{ fontWeight: 600, color: "#1e293b", fontSize: 17 }}>AI Resume Compiler</span>
              </div>
              <ChevronRight size={14} color="#cbd5e1" />
              <span style={{ fontSize: 14, fontWeight: 500, color: "#64748b" }}>字节跳动 · AI 产品经理</span>
            </div>
            {/* 步骤条（线性流程：上传 → 编译 → 完成，当前=编译）*/}
            <StepBar current={1} />
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button className="gbtn" style={ghostBtn}><Globe size={15} /> 中 / EN</button>
              {!allDone && <span style={{ fontSize: 12.5, color: "#94a3b8" }}>还有 {remaining} 段待处理</span>}
              <button className="pbtn" disabled={!allDone} style={{ ...primaryBtn, opacity: allDone ? 1 : 0.45, cursor: allDone ? "pointer" : "not-allowed", background: allDone ? "linear-gradient(135deg,#6366f1,#4f46e5)" : "#94a3b8" }}>
                <Sparkles size={15} /> 完成编译
              </button>
            </div>
          </header>

          <div style={{ display: "grid", gridTemplateColumns: "248px 1fr 344px", height: "calc(100vh - 64px)", minHeight: 660, position: "relative", zIndex: 1 }}>

            {/* 左栏 */}
            <aside style={{ borderRight: "1px solid #e2e8f0", background: "#fff", overflowY: "auto", padding: "22px 14px" }}>
              <div style={navTitle}>简历段落</div>
              {/* 母版保持完整的弱提示 */}
              <div style={{ margin: "0 12px 14px", padding: "8px 10px", background: "#f5f3ff", borderRadius: 8, fontSize: 11, color: "#6366f1", lineHeight: 1.5 }}>
                母版保持完整 · 你正在编辑针对此岗位的子版
              </div>
              {SECTIONS.map((s) => {
                const isA = s.id === activeId;
                return (
                  <div key={s.id} className="seg" onClick={() => { setActiveId(s.id); setEditing(null); setShowPreview(false); }}
                    style={{ display: "flex", alignItems: "flex-start", gap: 11, padding: "11px 12px", borderRadius: 10, cursor: "pointer", marginBottom: 3, background: isA ? "#eef2ff" : "transparent", boxShadow: isA ? "inset 3px 0 0 #4f46e5" : "none" }}>
                    <div style={{ marginTop: 1 }}>
                      {s.status === "done" ? <CheckCircle2 size={17} color="#059669" /> : isA ? <div style={{ width: 17, height: 17, borderRadius: 99, background: "#4f46e5", display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ width: 6, height: 6, borderRadius: 99, background: "#fff" }} /></div> : <div style={{ width: 17, height: 17, borderRadius: 99, border: "2px solid #cbd5e1" }} />}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: isA ? 600 : 500, color: isA ? "#4338ca" : "#334155", lineHeight: 1.3 }}>{s.nav}</div>
                      <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 2 }}>{s.type}</div>
                    </div>
                  </div>
                );
              })}
              <div style={{ margin: "18px 12px 0", padding: 16, borderRadius: 12, background: "linear-gradient(135deg,#f8fafc,#f1f5f9)", border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8, display: "flex", justifyContent: "space-between" }}><span>编译进度</span><span style={{ fontWeight: 600, color: "#1e293b" }}>{doneCount}/{total}</span></div>
                <div style={{ height: 6, background: "#e2e8f0", borderRadius: 99, overflow: "hidden" }}><div style={{ height: "100%", width: `${(doneCount / total) * 100}%`, background: "linear-gradient(90deg,#6366f1,#4f46e5)", borderRadius: 99 }} /></div>
              </div>
            </aside>

            {/* 中栏 */}
            <main style={{ overflowY: "auto", padding: "30px 40px" }}>
              <div style={{ maxWidth: 660, margin: "0 auto" }}>
                <div className="serif" style={{ fontSize: 26, fontWeight: 600 }}>{sec.nav}</div>
                <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 3, marginBottom: 22 }}>{sec.type}</div>

                {sec.simple ? (
                  <div className="shadow-soft" style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 24, textAlign: "center" }}>
                    <Database size={28} color="#cbd5e1" style={{ marginBottom: 12 }} />
                    <div style={{ fontSize: 14, color: "#64748b", lineHeight: 1.6 }}>{SIMPLE_DATA[sec.id]?.note}</div>
                  </div>
                ) : (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "#6366f1", background: "#eef2ff", padding: "9px 13px", borderRadius: 9, marginBottom: 20 }}>
                      <Sparkles size={14} /> AI 把这段原文拆解、改写成 {sec.bullets.length} 条 bullet，每条标注信息来源
                    </div>
                    <div className="shadow-soft" style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "16px 18px", marginBottom: 4 }}>
                      <div style={origLabel}>原文（你的母版）</div>
                      <div style={{ fontSize: 14, color: "#64748b", lineHeight: 1.7 }}>{sec.original}</div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "6px 0" }}>
                      <div style={{ width: 1, height: 12, background: "#cbd5e1" }} />
                      <div style={{ fontSize: 11, color: "#94a3b8", display: "flex", alignItems: "center", gap: 5, padding: "2px 0" }}><Sparkles size={11} color="#6366f1" /> AI 拆解改写</div>
                      <div style={{ width: 1, height: 12, background: "#cbd5e1" }} />
                    </div>

                    {/* 采纳全部绿黄（克制次要按钮，红色排除在外，强制单独确认） */}
                    {(() => {
                      const safe = sec.bullets.filter((b) => b.kind !== "added");
                      const allSafeDone = safe.every((b) => adopted[b.id] === true);
                      const hasRed = sec.bullets.some((b) => b.kind === "added");
                      return (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, padding: "10px 14px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10 }}>
                          <span style={{ fontSize: 12.5, color: "#94a3b8" }}>{hasRed ? "红色需你单独确认" : "全部为可信改写"}</span>
                          <button className="gbtn" onClick={() => { const m = {}; safe.forEach((b) => (m[b.id] = true)); setAdopted((p) => ({ ...p, ...m })); }}
                            disabled={allSafeDone}
                            style={{ ...ghostBtn, padding: "6px 12px", fontSize: 12.5, opacity: allSafeDone ? 0.5 : 1, cursor: allSafeDone ? "default" : "pointer" }}>
                            <CheckCircle2 size={14} color="#059669" /> {allSafeDone ? "绿色/黄色已采纳" : "采纳全部绿色 / 黄色"}
                          </button>
                        </div>
                      );
                    })()}

                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      {sec.bullets.map((b) => {
                        const m = SOURCE[b.kind];
                        const Icon = m.icon;
                        const isAdded = b.kind === "added";
                        const st = adopted[b.id];
                        const isExp = expanded[b.id];
                        // #1 方案A：绿黄用左侧色条，红用色边框+底色
                        const cardBorder = isAdded ? m.border : "#e2e8f0";
                        const cardBg = isAdded ? m.soft : "#fff";
                        return (
                          <div key={b.id} className="bcard" style={{ border: `1px solid ${cardBorder}`, borderLeft: `3px solid ${m.bar}`, borderRadius: 14, background: cardBg, overflow: "hidden", boxShadow: isAdded ? "0 2px 8px rgba(225,29,72,.06)" : "0 1px 3px rgba(15,23,42,.05)" }}>
                            <div style={{ padding: "15px 18px" }}>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 11 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                                  <span style={{ fontSize: 11, fontWeight: 600, color: "#cbd5e1" }}>{b.index}</span>
                                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: m.soft, border: `1px solid ${m.border}`, padding: "3px 9px", borderRadius: 99 }}>
                                    <Icon size={13} color={m.dot} /><span style={{ fontSize: 11.5, fontWeight: 600, color: m.text }}>{m.label}</span>
                                  </span>
                                </div>
                                {!isAdded && (
                                  <button className="gbtn edit-btn" onClick={() => setEditing(editing === b.id ? null : b.id)} style={{ ...ghostBtn, padding: "5px 9px", fontSize: 12 }}><Pencil size={12} /> 编辑</button>
                                )}
                              </div>
                              {editing === b.id ? (
                                <textarea defaultValue={b.text} autoFocus style={{ width: "100%", minHeight: 60, border: "1.5px solid #c7d2fe", borderRadius: 8, padding: 11, fontSize: 14, lineHeight: 1.6, color: "#1e293b", outline: "none", resize: "vertical", fontFamily: "inherit" }} />
                              ) : (
                                <div style={{ fontSize: 14.5, lineHeight: 1.7, color: isAdded ? "#9f1239" : "#1e293b" }}>{highlight(b.text, b.highlights)}</div>
                              )}
                              {/* #2 改动说明折叠 */}
                              {!isAdded && (
                                <>
                                  <button className="expand" onClick={() => setExpanded((p) => ({ ...p, [b.id]: !p[b.id] }))} style={{ marginTop: 11, display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 12, color: "#94a3b8" }}>
                                    <Info size={12} /> 为什么这样改 <ChevronDown size={13} style={{ transform: isExp ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
                                  </button>
                                  {isExp && (
                                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #f1f5f9", fontSize: 12.5, color: "#64748b", lineHeight: 1.65 }}>
                                      <div><span style={{ fontWeight: 600, color: "#475569" }}>改动 </span>{b.change}</div>
                                      <div><span style={{ fontWeight: 600, color: "#475569" }}>原因 </span>{b.reason}</div>
                                      <div style={{ marginTop: 9, display: "flex", gap: 6, flexWrap: "wrap" }}>
                                        {b.keywords.map((k) => <span key={k} style={{ fontSize: 11, background: "#eef2ff", color: "#4338ca", padding: "2px 9px", borderRadius: 99, fontWeight: 500 }}>命中 · {k}</span>)}
                                      </div>
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                            {isAdded && (
                              <div style={{ background: "#fff", borderTop: `1px solid ${m.border}`, padding: "13px 18px" }}>
                                {st == null ? (
                                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "#be123c" }}><AlertCircle size={15} /> AI 推测你可能有此经历，请确认</div>
                                    <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                                      <button className="pbtn" onClick={() => setAdopted((p) => ({ ...p, [b.id]: true }))} style={redBtn}><Check size={14} /> 我有，采纳</button>
                                      <button className="gbtn" onClick={() => setAdopted((p) => ({ ...p, [b.id]: false }))} style={rejectBtn}><X size={14} /> 我没有</button>
                                    </div>
                                  </div>
                                ) : st ? (
                                  <div style={{ fontSize: 12.5, color: "#047857", display: "flex", alignItems: "center", gap: 7, fontWeight: 500 }}><CheckCircle2 size={15} /> 已采纳 — 将写入子版（建议补充真实细节）</div>
                                ) : (
                                  <div style={{ fontSize: 12.5, color: "#94a3b8", display: "flex", alignItems: "center", gap: 7 }}><X size={15} /> 已排除 — 不写入简历</div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <button onClick={() => setShowPreview(true)} className="gbtn" style={{ ...ghostBtn, marginTop: 18, width: "100%", justifyContent: "center", padding: 10 }}>
                      <Eye size={15} /> 预览最终段落效果（采纳 {acceptedBullets.length} 条）
                    </button>
                  </>
                )}

                {/* #4 段落导航 */}
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 28, paddingTop: 20, borderTop: "1px solid #e2e8f0" }}>
                  <button className="gbtn" onClick={() => go(-1)} disabled={idx === 0} style={{ ...ghostBtn, opacity: idx === 0 ? 0.4 : 1 }}><ArrowLeft size={15} /> 上一段</button>
                  <button className="pbtn" onClick={() => go(1)} disabled={idx === ORDER.length - 1} style={{ ...primaryBtn, opacity: idx === ORDER.length - 1 ? 0.4 : 1 }}>下一段 <ArrowRight size={15} /></button>
                </div>
              </div>
            </main>

            {/* 右栏 — #1 三块明确分组 */}
            <aside style={{ borderLeft: "1px solid #e2e8f0", background: "#fff", overflowY: "auto", padding: 22, display: "flex", flexDirection: "column", gap: 24 }}>
              {/* 块1：全局匹配度双环（随采纳实时上涨，不随切段变） */}
              <section>
                <div style={{ ...sideTitle, display: "flex", alignItems: "center", gap: 6, marginBottom: 14 }}><Target size={13} /> 整份简历匹配度</div>
                <div style={{ background: "linear-gradient(135deg,#fafbff,#f5f3ff)", border: "1px solid #e9ecfb", borderRadius: 16, padding: "20px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14 }}>
                    <Ring value={GLOBAL_BEFORE} label="改写前" dim size={72} stroke={7} />
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                      <ArrowRight size={18} color="#94a3b8" />
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#059669", background: "#d1fae5", padding: "1px 8px", borderRadius: 99 }}>+{globalScore - GLOBAL_BEFORE}</span>
                    </div>
                    <Ring key={globalScore} value={globalScore} label="当前" size={116} stroke={11} />
                  </div>
                  <div style={{ fontSize: 11.5, color: "#94a3b8", textAlign: "center", marginTop: 12, lineHeight: 1.5 }}>
                    采纳更多改写 / 确认 AI 补充，分数实时上涨
                  </div>
                  <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 12, fontSize: 10.5, color: "#94a3b8" }}>
                    <Legend c="#e11d48" t="<60" /><Legend c="#d97706" t="60-70" /><Legend c="#059669" t="70-80" /><Legend c="#4f46e5" t="80+" />
                  </div>
                </div>
              </section>

              {/* 块2：JD 命中 */}
              <section style={{ paddingTop: 24, borderTop: "1px solid #f1f5f9" }}>
                <div style={{ ...sideTitle, display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}><Target size={13} /> 本段 JD 要求命中</div>
                {sec.jd.length ? sec.jd.map((r) => {
                  const hb = sec.bullets.find((b) => b.id === r.hit);
                  const met = hb && (hb.kind !== "added" || adopted[hb.id] === true);
                  return (
                    <div key={r.id} className="jdrow" style={{ padding: 10, borderRadius: 8, marginBottom: 2 }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
                        {met ? <CheckCircle2 size={16} color="#059669" style={{ marginTop: 1, flexShrink: 0 }} /> : <AlertCircle size={16} color="#cbd5e1" style={{ marginTop: 1, flexShrink: 0 }} />}
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, color: met ? "#1e293b" : "#94a3b8", fontWeight: 500, lineHeight: 1.4 }}>{r.label}</div>
                          <div style={{ fontSize: 11.5, color: met ? "#059669" : "#cbd5e1", marginTop: 3 }}>{met ? `由 bullet ${r.hit.slice(-1)} 命中 · ${r.words}` : (r.conditional ? "待确认 AI 补充的 bullet" : "暂未命中")}</div>
                        </div>
                      </div>
                    </div>
                  );
                }) : <div style={{ fontSize: 12.5, color: "#cbd5e1" }}>该段无需匹配 JD</div>}
              </section>

              {/* 块3：母版事实 */}
              <section style={{ paddingTop: 24, borderTop: "1px solid #f1f5f9" }}>
                <div style={{ ...sideTitle, display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}><Database size={13} /> AI 掌握的事实</div>
                <div style={{ fontSize: 11.5, color: "#94a3b8", marginBottom: 12, lineHeight: 1.5 }}>改写只基于这些事实，不凭空捏造</div>
                {(sec.simple ? SIMPLE_DATA[sec.id]?.facts : sec.facts)?.map((f) => (
                  <div key={f} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: "#475569", padding: "6px 0", lineHeight: 1.4 }}><Check size={13} color="#059669" style={{ marginTop: 3, flexShrink: 0 }} /> {f}</div>
                ))}
              </section>
            </aside>
          </div>
        </div>
      </div>

      {/* ===== 最终预览弹窗（定稿）===== */}
      {showPreview && sec && !sec.simple && (
        <div className="m-backdrop" onClick={() => setShowPreview(false)}
          style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(15,23,42,.55)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div className="m-dialog" onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 520, background: "#0f172a", borderRadius: 16, boxShadow: "0 24px 60px rgba(0,0,0,.45)", overflow: "hidden" }}>
            {/* 顶部栏 */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 22px", borderBottom: "1px solid rgba(255,255,255,.08)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#fff", fontSize: 14, fontWeight: 600 }}>
                <Eye size={16} color="#818cf8" /> 简历预览效果
              </div>
              <button className="m-close" onClick={() => setShowPreview(false)} style={{ width: 30, height: 30, borderRadius: 8, border: "none", background: "transparent", color: "#94a3b8", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <X size={18} />
              </button>
            </div>
            {/* 真简历排版 */}
            <div style={{ padding: "26px 28px" }}>
              <div className="serif" style={{ fontSize: 21, fontWeight: 600, color: "#fff" }}>{sec.nav}</div>
              <div style={{ fontSize: 12.5, color: "#64748b", marginTop: 4, marginBottom: 18 }}>{sec.type}</div>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 14 }}>
                {acceptedBullets.map((b) => (
                  <li key={b.id} style={{ display: "flex", gap: 11, fontSize: 14, color: "#e2e8f0", lineHeight: 1.7 }}>
                    <span style={{ width: 5, height: 5, borderRadius: 99, background: "#818cf8", marginTop: 9, flexShrink: 0 }} />
                    <span>{b.text}</span>
                  </li>
                ))}
              </ul>
            </div>
            {/* 底部栏 */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 22px", borderTop: "1px solid rgba(255,255,255,.08)" }}>
              <span style={{ fontSize: 12, color: "#64748b" }}>已采纳 {acceptedBullets.length} 条 · 信息均来源于母版与确认内容</span>
              <button className="m-link" onClick={() => setShowPreview(false)} style={{ fontSize: 12.5, color: "#94a3b8", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                <Pencil size={12} /> 去修改
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 线性流程步骤条：上传 → 编译 → 完成
function StepBar({ current }) {
  const steps = ["上传", "编译", "完成"];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
      {steps.map((s, i) => {
        const active = i === current, done = i < current;
        return (
          <React.Fragment key={s}>
            <span style={{ display: "flex", alignItems: "center", gap: 6, color: active ? "#4f46e5" : done ? "#059669" : "#cbd5e1", fontWeight: active ? 600 : 500 }}>
              <span style={{ width: 19, height: 19, borderRadius: 99, background: active ? "#4f46e5" : done ? "#059669" : "#f1f5f9", color: (active || done) ? "#fff" : "#94a3b8", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" }}>{done ? "✓" : i + 1}</span>
              {s}
            </span>
            {i < steps.length - 1 && <span style={{ width: 22, height: 1, background: "#e2e8f0" }} />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function Legend({ c, t }) {
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><span style={{ width: 7, height: 7, borderRadius: 99, background: c }} />{t}</span>;
}

const primaryBtn = { display: "flex", alignItems: "center", gap: 6, background: "linear-gradient(135deg,#6366f1,#4f46e5)", color: "#fff", border: "none", borderRadius: 9, padding: "9px 17px", fontSize: 13, fontWeight: 600, cursor: "pointer", boxShadow: "0 2px 8px rgba(79,70,229,.25)" };
const ghostBtn = { display: "flex", alignItems: "center", gap: 6, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 9, padding: "8px 13px", fontSize: 13, color: "#475569", cursor: "pointer" };
const redBtn = { display: "flex", alignItems: "center", gap: 5, background: "linear-gradient(135deg,#f43f5e,#e11d48)", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", boxShadow: "0 2px 8px rgba(225,29,72,.25)" };
const rejectBtn = { display: "flex", alignItems: "center", gap: 5, background: "#fff", color: "#64748b", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 14px", fontSize: 12.5, fontWeight: 500, cursor: "pointer" };
const navTitle = { fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".07em", padding: "0 12px 14px" };
const sideTitle = { fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: ".06em" };
const origLabel = { fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 };
