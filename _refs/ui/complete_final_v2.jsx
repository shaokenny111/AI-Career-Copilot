import React, { useState, useEffect, useRef } from "react";
import {
  CheckCircle2, FileDown, Copy, FileType, ArrowLeft, ArrowRight,
  Send, Sparkles, ShieldCheck, ChevronDown, ChevronUp, RotateCcw, Home, TrendingUp,
  Globe, FileText, ChevronRight
} from "lucide-react";

const scoreColor = (s) => s < 60 ? "#e11d48" : s < 70 ? "#d97706" : s < 80 ? "#059669" : "#4f46e5";
const scoreColorLight = (s) => s < 60 ? "#fb7185" : s < 70 ? "#fbbf24" : s < 80 ? "#34d399" : "#6366f1";

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

function CountUp({ to, duration = 1400 }) {
  const [v, setV] = useState(0);
  const ref = useRef();
  useEffect(() => {
    let start;
    const step = (t) => { if (!start) start = t; const p = Math.min((t - start) / duration, 1); setV(Math.round((1 - Math.pow(1 - p, 3)) * to)); if (p < 1) ref.current = requestAnimationFrame(step); };
    ref.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(ref.current);
  }, [to, duration]);
  return <>{v}</>;
}

// #2 大环里同时呈现分数 + 提升感
function HeroRing({ value, delta, size = 188, stroke = 15 }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, offset = c * (1 - value / 100);
  const col = scoreColor(value), colL = scoreColorLight(value);
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <defs><linearGradient id="heroGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor={colL} /><stop offset="100%" stopColor={col} /></linearGradient></defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef0f5" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="url(#heroGrad)" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset} style={{ transition: "stroke-dashoffset 1.5s cubic-bezier(.22,1,.36,1)" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span className="serif" style={{ fontSize: 58, fontWeight: 600, color: col, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}><CountUp to={value} /></span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 12.5, fontWeight: 600, color: "#059669", background: "#d1fae5", padding: "2px 9px", borderRadius: 99, marginTop: 8 }}>
          <TrendingUp size={12} /> 较改写前 +{delta}
        </span>
      </div>
    </div>
  );
}

const GLOBAL = { before: 65, after: 84 };
const SEG_ADOPT = [
  { name: "AI Resume Copilot", adopted: 3, total: 3 },
  { name: "海晟佛山金融租赁", adopted: 2, total: 3 },
  { name: "国元证券 投行实习", adopted: 3, total: 3 },
  { name: "HSBC 证券服务", adopted: 2, total: 3 },
];
const SUBSTANTIVE_GAPS = [
  { req: "2 年以上互联网产品经验", severity: "hard_filter", strategy: "用 AI Resume Copilot 个人项目证明从 0 到 1 的完整产品落地能力，弱化行业差异，强调可迁移的业务理解。" },
  { req: "电商 / 大模型应用场景经验", severity: "important", strategy: "面试前深度体验电商 AI 竞品（如京东京言），准备一份竞品分析作为敲门砖。" },
];
const SEVERITY = {
  hard_filter: { label: "硬性门槛", color: "#e11d48", bar: "#f43f5e" },
  important: { label: "重要差距", color: "#d97706", bar: "#fbbf24" },
};

/*
 * 开发注记：加载态（导出生成中）、错误态（导出失败重试）、移动端兜底页，开发时补。
 */
export default function CompletePage() {
  const [applied, setApplied] = useState(false);
  const [showDetail, setShowDetail] = useState(false);

  return (
    <div style={{ fontFamily: "'IBM Plex Sans',system-ui,sans-serif", background: "#f8fafc", minHeight: "100vh", color: "#1e293b" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=IBM+Plex+Sans:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        .serif { font-family: 'Fraunces', Georgia, serif; }
        .card { background:#fff; border:1px solid #e2e8f0; border-radius:16px; box-shadow: 0 1px 2px -1px rgb(15 23 42/.08), 0 4px 12px -2px rgb(15 23 42/.06); }
        .gbtn { transition: all .15s; } .gbtn:hover { background:#f8fafc; border-color:#cbd5e1; }
        .pbtn { transition: all .15s; } .pbtn:hover { box-shadow: 0 6px 18px rgba(79,70,229,.35); transform: translateY(-1px); }
        .exp { transition: transform .2s, box-shadow .2s, border-color .2s; }
        .exp:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(79,70,229,.12); }
        .exp-primary:hover { border-color:#4f46e5; }
        @keyframes pop { from { opacity:0; transform: scale(.9) } to { opacity:1; transform: scale(1) } }
        .anim-pop { animation: pop .25s cubic-bezier(.22,1,.36,1); }
      `}</style>

      <div style={{ position: "relative" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 380, background: "radial-gradient(55% 55% at 50% 0%, rgba(99,102,241,.10), transparent 70%)", pointerEvents: "none" }} />

        {/* 统一 Header：固定区(logo可点击回首页) + 上下文 + 操作区(中/EN全局) */}
        <header style={{ height: 60, borderBottom: "1px solid #e2e8f0", background: "rgba(255,255,255,.85)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 28px", position: "relative", zIndex: 2 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div title="返回首页" style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <div style={{ width: 30, height: 30, background: "linear-gradient(135deg,#6366f1,#4f46e5)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(79,70,229,.3)" }}><FileText size={16} color="#fff" /></div>
              <span className="serif" style={{ fontWeight: 600, fontSize: 16 }}>AI Resume Compiler</span>
            </div>
            <ChevronRight size={14} color="#cbd5e1" />
            <span style={{ fontSize: 13, fontWeight: 500, color: "#64748b" }}>字节跳动 · AI 产品经理</span>
          </div>
          <StepBar current={2} />
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button className="gbtn" style={ghostBtn}><Globe size={15} /> 中 / EN</button>
            <button className="gbtn" style={ghostBtn}><ArrowLeft size={15} /> 返回工作台</button>
          </div>
        </header>

        <div style={{ maxWidth: 720, margin: "0 auto", padding: "44px 24px 80px", position: "relative", zIndex: 1 }}>

          {/* #1 弱化完成标志：一行带对勾的标题，不再是独立大圆 */}
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, color: "#059669", background: "#ecfdf5", border: "1px solid #a7f3d0", padding: "5px 14px", borderRadius: 99, marginBottom: 14 }}>
              <CheckCircle2 size={15} /> 编译完成
            </div>
            <div className="serif" style={{ fontSize: 28, fontWeight: 600 }}>你的投递版本已生成</div>
            <div style={{ fontSize: 14, color: "#94a3b8", marginTop: 6 }}>针对「字节跳动 · AI 产品经理」</div>
          </div>

          {/* 模块1：大环做唯一主角（#1#2）— 留白最大（#6）*/}
          <div className="card" style={{ padding: 36, marginBottom: 28, display: "flex", alignItems: "center", gap: 36 }}>
            <HeroRing value={GLOBAL.after} delta={GLOBAL.after - GLOBAL.before} />
            <div style={{ flex: 1 }}>
              <div style={sectionTitle}>整份简历匹配度</div>
              <div style={{ fontSize: 15, color: "#334155", lineHeight: 1.7, margin: "12px 0" }}>
                按 JD 要求<b style={{ fontWeight: 600 }}>加权命中</b>计算，基于你实际采纳的改写。
                <br />同岗位投递者中约处于<b style={{ fontWeight: 600, color: "#4f46e5" }}>前 30%</b>。
              </div>
              <button onClick={() => setShowDetail(!showDetail)} className="gbtn" style={{ ...ghostBtn, marginTop: 6, padding: "7px 13px", fontSize: 12.5 }}>
                {showDetail ? <ChevronUp size={14} /> : <ChevronDown size={14} />} 各段采纳明细
              </button>
            </div>
          </div>

          {showDetail && (
            <div className="card" style={{ padding: 22, marginBottom: 28 }}>
              <div style={{ ...sectionTitle, marginBottom: 16 }}>各段改写采纳情况</div>
              {SEG_ADOPT.map((s) => (
                <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 14, padding: "9px 0", fontSize: 13.5 }}>
                  <div style={{ width: 180, color: "#334155", fontWeight: 500 }}>{s.name}</div>
                  <div style={{ flex: 1, height: 6, background: "#f1f5f9", borderRadius: 99, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(s.adopted / s.total) * 100}%`, background: "linear-gradient(90deg,#6366f1,#4f46e5)", borderRadius: 99 }} />
                  </div>
                  <div style={{ width: 84, textAlign: "right", color: "#64748b" }}>采纳 {s.adopted}/{s.total} 条</div>
                </div>
              ))}
            </div>
          )}

          {/* 模块2：诚实差距 — #3 改贴心感（中性白底+左侧色条，不再整片黄）*/}
          <div className="card" style={{ padding: 26, marginBottom: 24 }}>
            <div style={{ ...sectionTitle, display: "flex", alignItems: "center", gap: 8, color: "#475569" }}>
              <ShieldCheck size={16} color="#4f46e5" /> 诚实差距 · 这些靠面试应对，不靠改写假装
            </div>
            <div style={{ fontSize: 13, color: "#94a3b8", margin: "8px 0 18px", lineHeight: 1.6 }}>
              我们不会用改写让你看起来像另一个人。以下是真实存在的差距，附上面试时的应对策略。
            </div>
            {SUBSTANTIVE_GAPS.map((g, i) => {
              const sv = SEVERITY[g.severity];
              return (
                <div key={i} style={{ padding: "16px 18px", borderRadius: 12, background: "#fafbfc", border: "1px solid #eef0f5", borderLeft: `3px solid ${sv.bar}`, marginBottom: i === 0 ? 12 : 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 9 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: sv.color }}>{sv.label}</span>
                    <span style={{ fontSize: 14.5, fontWeight: 600 }}>{g.req}</span>
                  </div>
                  <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.65, display: "flex", gap: 8 }}>
                    <Sparkles size={14} color="#6366f1" style={{ marginTop: 3, flexShrink: 0 }} />
                    <span><b style={{ color: "#475569", fontWeight: 600 }}>应对策略 </b>{g.strategy}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 模块3：三层导出 — #4 PDF 推荐突出 */}
          <div className="card" style={{ padding: 26, marginBottom: 24 }}>
            <div style={sectionTitle}>导出投递版本</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginTop: 18 }}>
              {/* PDF 推荐 */}
              <button className="exp exp-primary" style={{ ...exportBtn, border: "1.5px solid #c7d2fe", background: "linear-gradient(135deg,#fafbff,#f5f3ff)", position: "relative" }}>
                <span style={{ position: "absolute", top: 10, right: 10, fontSize: 10, fontWeight: 600, color: "#4f46e5", background: "#eef2ff", padding: "2px 7px", borderRadius: 99 }}>推荐</span>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: "#4f46e5", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 4 }}>
                  <FileDown size={21} color="#fff" />
                </div>
                <span style={{ fontWeight: 600, fontSize: 14.5 }}>PDF</span>
                <span style={{ fontSize: 11.5, color: "#94a3b8" }}>标准投递格式</span>
              </button>
              {[{ icon: FileType, name: "Word", desc: "可二次编辑" }, { icon: Copy, name: "逐段复制", desc: "适配在线表单" }].map((e) => (
                <button key={e.name} className="exp" style={exportBtn}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 4 }}>
                    <e.icon size={20} color="#64748b" />
                  </div>
                  <span style={{ fontWeight: 600, fontSize: 14.5 }}>{e.name}</span>
                  <span style={{ fontSize: 11.5, color: "#94a3b8" }}>{e.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 模块4：投递标记 — #5 浅 indigo 底，动作性区分 */}
          <div style={{ borderRadius: 16, border: "1px solid #e0e7ff", background: "linear-gradient(135deg,#f5f3ff,#eef2ff)", padding: 22, display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 36 }}>
            <div>
              <div style={{ fontSize: 14.5, fontWeight: 600 }}>投出去了吗？标记一下</div>
              <div style={{ fontSize: 12.5, color: "#6366f1", marginTop: 3 }}>{applied ? "已于今天投递 · 归档至子版库" : "标记后可在子版库随时回顾这次投递"}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {applied && <span className="anim-pop" style={{ fontSize: 12.5, color: "#059669", fontWeight: 500, display: "flex", alignItems: "center", gap: 5 }}><CheckCircle2 size={14} /> 已归档至子版库</span>}
              <button onClick={() => setApplied(!applied)} className={applied ? "" : "pbtn"} style={applied ? appliedBtn : primaryBtn}>
                {applied ? <><CheckCircle2 size={15} /> 已投递</> : <><Send size={15} /> 标记已投递</>}
              </button>
            </div>
          </div>

          {/* #7 底部出口：闭环 */}
          <div style={{ display: "flex", justifyContent: "center", gap: 12, paddingTop: 8 }}>
            <button className="gbtn" style={ghostBtn}><Home size={15} /> 返回我的简历</button>
            <button className="gbtn" style={ghostBtn}><RotateCcw size={15} /> 再编译一个岗位</button>
          </div>
        </div>
      </div>
    </div>
  );
}

const sectionTitle = { fontSize: 12, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: ".06em" };
const ghostBtn = { display: "flex", alignItems: "center", gap: 6, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 9, padding: "8px 14px", fontSize: 13, color: "#475569", cursor: "pointer" };
const primaryBtn = { display: "flex", alignItems: "center", gap: 6, background: "linear-gradient(135deg,#6366f1,#4f46e5)", color: "#fff", border: "none", borderRadius: 10, padding: "11px 20px", fontSize: 13.5, fontWeight: 600, cursor: "pointer", boxShadow: "0 2px 8px rgba(79,70,229,.25)" };
const appliedBtn = { display: "flex", alignItems: "center", gap: 6, background: "#fff", color: "#047857", border: "1px solid #a7f3d0", borderRadius: 10, padding: "11px 20px", fontSize: 13.5, fontWeight: 600, cursor: "pointer" };
const exportBtn = { display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "20px 10px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, cursor: "pointer" };
