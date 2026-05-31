import React, { useState } from "react";
import {
  Upload, FileText, Sparkles, ArrowRight, X, Building2, Briefcase,
  Lightbulb, CheckCircle2, CircleHelp, CircleAlert, Wrench, Info, Globe
} from "lucide-react";

const TYPES = {
  A_master:    { label: "完整母版", color: "#059669", bg: "#ecfdf5", border: "#a7f3d0", icon: CheckCircle2, desc: "经历完整，可直接编译", action: "将直接进入工作台" },
  B_compiled:  { label: "已精简版", color: "#d97706", bg: "#fffbeb", border: "#fde68a", icon: CircleHelp, desc: "像是为某次投递精简过，建议补充被删的经历", action: "编译时会提示补充母版" },
  C_incomplete:{ label: "半成品 / 应届", color: "#e11d48", bg: "#fff1f2", border: "#fecdd3", icon: CircleAlert, desc: "信息较少，建议走引导流程逐步建立母版", action: "将进入应届生引导" },
};

// 线性流程步骤条
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

/*
 * 开发注记：错误态（文件解析失败、JD 太短提示）、加载态（解析中）、移动端兜底页，开发时补。
 */
export default function UploadPage() {
  const [uploaded, setUploaded] = useState(false);
  const [type, setType] = useState(null);
  const [jd, setJd] = useState("");
  const [company, setCompany] = useState("");
  const [position, setPosition] = useState("");
  const [dragOver, setDragOver] = useState(false); // #7 拖拽状态

  const sim = (t) => { setUploaded(true); setType(t); };
  const t = type ? TYPES[type] : null;
  const canCompile = uploaded && jd.trim() && company.trim() && position.trim();
  const isC = type === "C_incomplete";

  return (
    <div style={{ fontFamily: "'IBM Plex Sans',system-ui,sans-serif", background: "#f8fafc", minHeight: "100vh", color: "#1e293b" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=IBM+Plex+Sans:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        .serif { font-family: 'Fraunces', Georgia, serif; }
        .card { background:#fff; border:1px solid #e2e8f0; border-radius:16px; box-shadow: 0 1px 2px -1px rgb(15 23 42/.08), 0 4px 12px -2px rgb(15 23 42/.06); }
        .gbtn { transition: all .15s; } .gbtn:hover { background:#f8fafc; border-color:#cbd5e1; }
        .pbtn { transition: all .15s; } .pbtn:hover:not(:disabled) { box-shadow: 0 6px 18px rgba(79,70,229,.35); transform: translateY(-1px); }
        .drop { transition: all .2s; } .drop:hover { border-color:#a5b4fc; background:#f5f3ff; }
        .demo:hover { border-color:#94a3b8; color:#475569; background:#fff; }
        textarea, input { font-family: inherit; }
        textarea:focus, .infield:focus-within { border-color:#a5b4fc; }
      `}</style>

      <div style={{ position: "relative" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 320, background: "radial-gradient(55% 55% at 50% 0%, rgba(99,102,241,.10), transparent 70%)", pointerEvents: "none" }} />

        {/* 统一 Header：固定区(logo可点击回首页) + 步骤条(上传) + 操作区(中/EN全局) */}
        <header style={{ height: 60, borderBottom: "1px solid #e2e8f0", background: "rgba(255,255,255,.85)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 28px", position: "relative", zIndex: 2 }}>
          <div title="返回首页" style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
            <div style={{ width: 30, height: 30, background: "linear-gradient(135deg,#6366f1,#4f46e5)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(79,70,229,.3)" }}><FileText size={16} color="#fff" /></div>
            <span className="serif" style={{ fontWeight: 600, fontSize: 17 }}>AI Resume Compiler</span>
          </div>
          <StepBar current={0} />
          <button className="gbtn" style={ghostBtn}><Globe size={15} /> 中 / EN</button>
        </header>

        <div style={{ maxWidth: 900, margin: "0 auto", padding: "44px 24px 60px", position: "relative", zIndex: 1 }}>
          <div style={{ textAlign: "center", marginBottom: 38 }}>
            <div className="serif" style={{ fontSize: 32, fontWeight: 600 }}>把简历编译成投递版本</div>
            <div style={{ fontSize: 14.5, color: "#94a3b8", marginTop: 10 }}>上传你的完整简历（母版），输入目标岗位，AI 帮你针对性优化</div>
          </div>

          {/* #2 两栏等高：用 align-items stretch + 内部 flex 撑满 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24, alignItems: "stretch" }}>
            {/* 左：上传 */}
            <div className="card" style={{ padding: 24, display: "flex", flexDirection: "column" }}>
              <div style={stepLabel}><span style={stepNum}>1</span> 上传简历（母版）</div>
              {!uploaded ? (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", marginTop: 16 }}>
                  <div className="drop" onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={(e) => { e.preventDefault(); setDragOver(false); }}
                    style={{ flex: 1, border: `2px dashed ${dragOver ? "#6366f1" : "#cbd5e1"}`, borderRadius: 14, padding: "16px", textAlign: "center", cursor: "pointer", background: dragOver ? "#eef2ff" : "#fafbfc", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 180 }}>
                    <div style={{ width: 46, height: 46, borderRadius: 12, background: "#eef2ff", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
                      <Upload size={22} color="#4f46e5" />
                    </div>
                    <div style={{ fontSize: 14, color: "#475569", fontWeight: 500 }}>{dragOver ? "松手即可上传" : "拖拽或点击上传"}</div>
                    <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 5 }}>PDF / Word / 图片，也可直接粘贴文本</div>
                  </div>
                </div>
              ) : (
                <div style={{ flex: 1, marginTop: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "13px 15px", background: "#fafbfc", borderRadius: 11, border: "1px solid #e2e8f0" }}>
                    <div style={{ width: 38, height: 38, borderRadius: 9, background: "#eef2ff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><FileText size={18} color="#4f46e5" /></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 500 }}>邵子康_简历.pdf</div>
                      <div style={{ fontSize: 11.5, color: "#94a3b8" }}>已解析 · 1820 字 · 6 段经历</div>
                    </div>
                    <button onClick={() => { setUploaded(false); setType(null); }} style={{ border: "none", background: "transparent", cursor: "pointer", padding: 4 }}><X size={16} color="#94a3b8" /></button>
                  </div>
                  {t && (
                    <div style={{ marginTop: 14, padding: 15, borderRadius: 11, background: t.bg, border: `1px solid ${t.border}` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
                        <t.icon size={15} color={t.color} /><span style={{ fontSize: 12.5, fontWeight: 600, color: t.color }}>AI 识别：{t.label}</span>
                      </div>
                      <div style={{ fontSize: 12.5, color: "#475569", lineHeight: 1.55 }}>{t.desc}</div>
                    </div>
                  )}
                  {/* #5 母版只建一次说明 */}
                  <div style={{ marginTop: 14, display: "flex", gap: 7, fontSize: 12, color: "#6366f1", background: "#eef2ff", padding: "9px 12px", borderRadius: 9, lineHeight: 1.5 }}>
                    <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                    这将成为你的母版，以后编译新岗位无需重复上传
                  </div>
                </div>
              )}
            </div>

            {/* 右：JD */}
            <div className="card" style={{ padding: 24, display: "flex", flexDirection: "column" }}>
              <div style={stepLabel}><span style={stepNum}>2</span> 目标岗位</div>
              <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
                <div style={{ display: "flex", gap: 10 }}>
                  <div className="infield" style={inWrap}><Building2 size={15} color="#94a3b8" /><input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="公司" style={inStyle} /></div>
                  <div className="infield" style={inWrap}><Briefcase size={15} color="#94a3b8" /><input value={position} onChange={(e) => setPosition(e.target.value)} placeholder="职位" style={inStyle} /></div>
                </div>
                <textarea value={jd} onChange={(e) => setJd(e.target.value)} placeholder="粘贴完整 JD 内容…（内容越完整，匹配分析越准）"
                  style={{ flex: 1, width: "100%", minHeight: 150, border: "1px solid #e2e8f0", borderRadius: 11, padding: 13, fontSize: 13.5, lineHeight: 1.6, color: "#1e293b", outline: "none", resize: "vertical", transition: "border-color .15s" }} />
              </div>
            </div>
          </div>

          {/* #1 演示控件：明确框起来，区分于产品 */}
          {!uploaded && (
            <div style={{ border: "1px dashed #cbd5e1", borderRadius: 12, padding: "12px 16px", marginBottom: 24, display: "flex", alignItems: "center", gap: 12, background: "#fcfcfd" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 600, color: "#94a3b8" }}><Wrench size={13} /> 演示</span>
              <span style={{ fontSize: 12, color: "#94a3b8" }}>模拟上传不同类型简历（真实产品中类型由 AI 自动识别）</span>
              <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
                <button className="demo" onClick={() => sim("A_master")} style={demoBtn}>A 类</button>
                <button className="demo" onClick={() => sim("B_compiled")} style={demoBtn}>B 类</button>
                <button className="demo" onClick={() => sim("C_incomplete")} style={demoBtn}>C 类</button>
              </div>
            </div>
          )}

          {/* #4 编译区：用一个"准备就绪"卡片包裹，拉近与内容的关系 */}
          {isC ? (
            <div style={{ borderRadius: 16, border: "1px solid #fed7aa", background: "linear-gradient(135deg,#fffbf5,#fff7ed)", padding: 22, display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: "#ffedd5", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Lightbulb size={20} color="#d97706" /></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14.5, fontWeight: 600, color: "#b45309" }}>建议先走引导流程</div>
                <div style={{ fontSize: 12.5, color: "#92703a", marginTop: 3, lineHeight: 1.5 }}>你的简历信息较少，AI 会根据 JD 提问，帮你一步步补全母版再编译</div>
              </div>
              <button className="pbtn" disabled={!canCompile} style={{ ...primaryBtn, background: canCompile ? "linear-gradient(135deg,#fb923c,#d97706)" : "#cbd5e1", boxShadow: canCompile ? "0 2px 8px rgba(217,119,6,.3)" : "none", cursor: canCompile ? "pointer" : "not-allowed" }}>进入引导 <ArrowRight size={15} /></button>
            </div>
          ) : (
            <div className="card" style={{ padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
              <div style={{ fontSize: 13, color: "#64748b" }}>
                {!uploaded ? "上传简历并填写目标岗位后即可编译" : !canCompile ? "再填写公司、职位和 JD 就可以开始" : t ? <>已就绪 · 识别为<b style={{ color: t.color, fontWeight: 600 }}>{t.label}</b>，{t.action}</> : ""}
              </div>
              <button className="pbtn" disabled={!canCompile} style={{ ...primaryBtn, padding: "12px 28px", fontSize: 14.5, opacity: canCompile ? 1 : 0.5, cursor: canCompile ? "pointer" : "not-allowed", background: canCompile ? "linear-gradient(135deg,#6366f1,#4f46e5)" : "#cbd5e1", boxShadow: canCompile ? "0 4px 14px rgba(79,70,229,.3)" : "none", flexShrink: 0 }}>
                <Sparkles size={16} /> 开始编译
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const stepLabel = { display: "flex", alignItems: "center", gap: 9, fontSize: 14.5, fontWeight: 600, color: "#334155" };
const stepNum = { width: 22, height: 22, borderRadius: 99, background: "linear-gradient(135deg,#6366f1,#4f46e5)", color: "#fff", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center" };
const inWrap = { flex: 1, display: "flex", alignItems: "center", gap: 8, border: "1px solid #e2e8f0", borderRadius: 10, padding: "9px 11px", transition: "border-color .15s" };
const inStyle = { border: "none", outline: "none", fontSize: 13.5, width: "100%", background: "transparent", color: "#1e293b" };
const demoBtn = { padding: "6px 14px", border: "1px solid #e2e8f0", borderRadius: 8, background: "#fff", fontSize: 12.5, color: "#94a3b8", cursor: "pointer", transition: "all .15s" };
const primaryBtn = { display: "flex", alignItems: "center", gap: 7, color: "#fff", border: "none", borderRadius: 11, padding: "11px 22px", fontSize: 14, fontWeight: 600, cursor: "pointer" };
const ghostBtn = { display: "flex", alignItems: "center", gap: 6, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "8px 13px", fontSize: 13, color: "#475569", cursor: "pointer" };
