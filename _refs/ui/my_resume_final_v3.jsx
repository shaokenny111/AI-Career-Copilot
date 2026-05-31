import React from "react";
import {
  FileText, Plus, Pencil, Sparkles, MoreHorizontal, FileDown,
  Eye, Clock, CheckCircle2, FileEdit, Layers, Database, ArrowRight, RefreshCw, Globe
} from "lucide-react";

// 子版卡用的小圆环
function MiniRing({ value, color, colorLight, size = 64, stroke = 6 }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, offset = c * (1 - value / 100);
  const gid = "mr" + value;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <defs><linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor={colorLight} /><stop offset="100%" stopColor={color} /></linearGradient></defs>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={stroke} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={`url(#${gid})`} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span className="serif" style={{ fontSize: 19, fontWeight: 600, color, lineHeight: 1 }}>{value}</span>
        <span style={{ fontSize: 8, color: "#94a3b8", marginTop: 1 }}>匹配</span>
      </div>
    </div>
  );
}

// ===== 四级分级（含颜色 + 边框 + 文字含义）=====
const tier = (s) => {
  if (s >= 80) return { color: "#4f46e5", light: "#6366f1", border: "#c7d2fe", bg: "#eef2ff", label: "强匹配" };
  if (s >= 70) return { color: "#059669", light: "#34d399", border: "#a7f3d0", bg: "#ecfdf5", label: "基本匹配" };
  if (s >= 60) return { color: "#d97706", light: "#fbbf24", border: "#fde68a", bg: "#fffbeb", label: "建议改进后投递" };
  return { color: "#e11d48", light: "#fb7185", border: "#fecdd3", bg: "#fff1f2", label: "差距较大" };
};

const VERSIONS = [
  { id: "v1", company: "字节跳动", position: "AI 产品经理", score: 84, status: "applied", date: "今天", appliedDate: "今天" },
  { id: "v2", company: "京东", position: "AI 产品经理", score: 72, status: "draft", date: "昨天" },
  { id: "v3", company: "美团", position: "策略产品经理", score: 66, status: "applied", date: "3 天前", appliedDate: "2 天前" },
  { id: "v4", company: "腾讯", position: "高级产品经理", score: 53, status: "draft", date: "5 天前" },
];
const STATUS = {
  applied: { label: "已投递", color: "#059669", bg: "#ecfdf5", border: "#a7f3d0", icon: CheckCircle2 },
  draft:   { label: "草稿", color: "#94a3b8", bg: "#f1f5f9", border: "#e2e8f0", icon: FileEdit },
};
const MASTER_SEGS = ["AI Resume Copilot", "海晟金融租赁", "国元证券", "HSBC", "EMLYON 硕士", "技能证书"];

/*
 * 开发注记：空状态（无子版时引导去编译第一个）、点击区域（整卡=查看，图标各自动作需阻止冒泡）、移动端兜底页，开发时补。
 */
export default function MyResumePage() {
  return (
    <div style={{ fontFamily: "'IBM Plex Sans',system-ui,sans-serif", background: "#f8fafc", minHeight: "100vh", color: "#1e293b" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=IBM+Plex+Sans:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        .serif { font-family: 'Fraunces', Georgia, serif; }
        .card { background:#fff; border:1px solid #e2e8f0; border-radius:16px; box-shadow: 0 1px 2px -1px rgb(15 23 42/.08), 0 4px 12px -2px rgb(15 23 42/.06); }
        .gbtn { transition: all .15s; } .gbtn:hover { background:#f8fafc; border-color:#cbd5e1; }
        .pbtn { transition: all .15s; } .pbtn:hover { box-shadow: 0 6px 18px rgba(79,70,229,.35); transform: translateY(-1px); }
        .vcard { transition: transform .2s, box-shadow .2s, border-color .2s; }
        .vcard:hover { transform: translateY(-2px); box-shadow: 0 8px 22px rgba(15,23,42,.1); border-color:#c7d2fe; }
        .vcard .acts { opacity:0; transition: opacity .15s; }
        .vcard:hover .acts { opacity:1; }
        .ibtn:hover { background:#eef2ff; }
        .mtag { transition: all .15s; }
      `}</style>

      <div style={{ position: "relative" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 300, background: "radial-gradient(55% 55% at 50% 0%, rgba(99,102,241,.08), transparent 70%)", pointerEvents: "none" }} />

        {/* 统一 Header：固定区(logo可点击) + 操作区(中/EN全局)。此页是首页，logo 点击留在首页 */}
        <header style={{ height: 60, borderBottom: "1px solid #e2e8f0", background: "rgba(255,255,255,.85)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 28px", position: "relative", zIndex: 2 }}>
          <div title="首页" style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
            <div style={{ width: 30, height: 30, background: "linear-gradient(135deg,#6366f1,#4f46e5)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(79,70,229,.3)" }}><FileText size={16} color="#fff" /></div>
            <span className="serif" style={{ fontWeight: 600, fontSize: 17 }}>AI Resume Compiler</span>
          </div>
          <button className="gbtn" style={ghostBtn}><Globe size={15} /> 中 / EN</button>
        </header>

        <div style={{ maxWidth: 880, margin: "0 auto", padding: "40px 24px 80px", position: "relative", zIndex: 1 }}>

          <div style={{ marginBottom: 30 }}>
            <div className="serif" style={{ fontSize: 28, fontWeight: 600 }}>你好，邵子康</div>
            <div style={{ fontSize: 14, color: "#94a3b8", marginTop: 6 }}>用母版编译新岗位，或回看已投递的版本</div>
          </div>

          {/* ===== 母版区（#7 更突出：更大、主色描边、经历预览 #1）===== */}
          <div style={{ ...sideTitle, display: "flex", alignItems: "center", gap: 7, marginBottom: 12 }}><Database size={14} /> 我的母版 · 一切编译的源头</div>
          <div style={{ borderRadius: 18, border: "1.5px solid #c7d2fe", background: "linear-gradient(135deg,#ffffff,#f5f3ff)", boxShadow: "0 4px 20px rgba(79,70,229,.1)", padding: 28, marginBottom: 44 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 22 }}>
              <div style={{ width: 64, height: 64, borderRadius: 16, background: "linear-gradient(135deg,#6366f1,#4f46e5)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 4px 12px rgba(79,70,229,.3)" }}>
                <FileText size={30} color="#fff" />
              </div>
              <div style={{ flex: 1 }}>
                <div className="serif" style={{ fontSize: 21, fontWeight: 600 }}>邵子康的简历母版</div>
                <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 5 }}>6 段经历 · 1820 字 · 最后更新于今天</div>
                {/* #1 经历预览 */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 14 }}>
                  {MASTER_SEGS.map((m) => (
                    <span key={m} className="mtag" style={{ fontSize: 12, color: "#4338ca", background: "#eef2ff", border: "1px solid #e0e7ff", padding: "3px 10px", borderRadius: 99 }}>{m}</span>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 9, flexShrink: 0 }}>
                <button className="pbtn" style={primaryBtn}><Sparkles size={15} /> 针对新岗位编译</button>
                <button className="gbtn" style={ghostBtn}><Pencil size={14} /> 查看 / 补充经历</button>
              </div>
            </div>
            <div style={{ fontSize: 12.5, color: "#94a3b8", marginTop: 18, paddingTop: 16, borderTop: "1px solid #e9ecfb", lineHeight: 1.5 }}>
              母版是你所有经历的完整集合，每次编译都从这里取材，始终完整保留 —— 子版的取舍不会动它分毫
            </div>
          </div>

          {/* ===== 子版库（#2 删除了这里的重复"编译新岗位"入口）===== */}
          <div style={{ ...sideTitle, display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}><Layers size={14} /> 子版库 · 已编译 {VERSIONS.length} 个岗位</div>
          <div style={{ fontSize: 12.5, color: "#cbd5e1", marginBottom: 14 }}>每个投递过的岗位都在这，点击可回看、微调或重新导出</div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {VERSIONS.map((v, i) => {
              const st = STATUS[v.status];
              const StIcon = st.icon;
              const t = tier(v.score);
              const isLatest = i === 0; // #4 最新略突出
              return (
                <div key={v.id} className="card vcard" style={{ padding: 18, display: "flex", alignItems: "center", gap: 18, cursor: "pointer", borderColor: t.border, borderWidth: 1.5, boxShadow: `0 1px 2px -1px rgb(15 23 42/.08), 0 4px 12px -2px ${t.color}14` }}>
                  {/* 分数圆环：四级分色 */}
                  <MiniRing value={v.score} color={t.color} colorLight={t.light} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 6, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 15.5, fontWeight: 600 }}>{v.company} · {v.position}</span>
                      {isLatest && <span style={{ fontSize: 10.5, fontWeight: 600, color: "#4f46e5", background: "#eef2ff", padding: "2px 7px", borderRadius: 99 }}>最新</span>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      {/* 四级分级标签（#3 文字含义）*/}
                      <span style={{ fontSize: 11.5, fontWeight: 600, color: t.color, background: t.bg, border: `1px solid ${t.border}`, padding: "2px 9px", borderRadius: 99 }}>{t.label}</span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, color: st.color, background: st.bg, border: `1px solid ${st.border}`, padding: "2px 8px", borderRadius: 99 }}>
                        <StIcon size={11} /> {st.label}
                      </span>
                      <span style={{ fontSize: 12, color: "#94a3b8", display: "inline-flex", alignItems: "center", gap: 5 }}>
                        <Clock size={11} /> {v.date}{v.appliedDate && ` · 投递于 ${v.appliedDate}`}
                      </span>
                    </div>
                  </div>
                  <div className="acts" style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button className="ibtn" style={iconBtn} title="查看 / 微调"><Eye size={16} color="#64748b" /></button>
                    <button className="ibtn" style={iconBtn} title="重新导出"><FileDown size={16} color="#64748b" /></button>
                    <button className="ibtn" style={iconBtn} title="更多"><MoreHorizontal size={16} color="#64748b" /></button>
                  </div>
                  <ArrowRight size={16} color="#cbd5e1" style={{ flexShrink: 0 }} />
                </div>
              );
            })}
          </div>

          {/* 四级图例 */}
          <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 18, fontSize: 11.5, color: "#94a3b8", flexWrap: "wrap" }}>
            <Legend c="#e11d48" t="<60 差距较大" /><Legend c="#d97706" t="60-70 建议改进" /><Legend c="#059669" t="70-80 基本匹配" /><Legend c="#4f46e5" t="80+ 强匹配" />
          </div>

          {/* 母版-子版联动 */}
          <div style={{ marginTop: 22, padding: "14px 18px", borderRadius: 12, background: "#fafbff", border: "1px dashed #e0e7ff", display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "#6366f1" }}>
            <RefreshCw size={15} style={{ flexShrink: 0 }} />
            母版修改后，可一键重新编译所有子版，让每个投递版本都用上最新经历
          </div>
        </div>
      </div>
    </div>
  );
}

function Legend({ c, t }) {
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 99, background: c }} />{t}</span>;
}

const sideTitle = { fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: ".06em" };
const primaryBtn = { display: "flex", alignItems: "center", gap: 6, background: "linear-gradient(135deg,#6366f1,#4f46e5)", color: "#fff", border: "none", borderRadius: 10, padding: "10px 16px", fontSize: 13.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", boxShadow: "0 2px 8px rgba(79,70,229,.25)" };
const ghostBtn = { display: "flex", alignItems: "center", gap: 6, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "9px 14px", fontSize: 13, color: "#475569", cursor: "pointer", whiteSpace: "nowrap" };
const iconBtn = { width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 9, cursor: "pointer", transition: "background .15s" };
