// ============================================================================
// 仅输入 JD 的编译入口页（Phase 8）
// ----------------------------------------------------------------------------
// 母版-子版心智：已有母版时，针对新岗位编译只需输入新 JD，绝不重新上传简历。
// 首页 / 母版页「针对新岗位编译」→ 本页 → 填 company/position/jd → /compile 执行。
//
// 与 UploadPage 的根本区别：本页【完全不碰 master】——不解析、不写入、不 reset。
// master 在上传时已建好，这里只读它做"取材来源"展示，编译管线从 storage 取 master。
// 无母版（直接刷到本页）→ 回 /upload 建母版。
// ============================================================================

import { useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import {
  Building2, Briefcase, Sparkles, ArrowLeft, Database, Info,
} from "lucide-react";
import { useAppStorage } from "../lib/useAppStorage";

function StepBar({ current }: { current: number }) {
  const steps = ["上传", "编译", "完成"];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, justifyContent: "center", marginBottom: 28 }}>
      {steps.map((s, i) => {
        const active = i === current, done = i < current;
        return (
          <span key={s} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6, color: active ? "#4f46e5" : done ? "#059669" : "#cbd5e1", fontWeight: active ? 600 : 500 }}>
              <span style={{ width: 19, height: 19, borderRadius: 99, background: active ? "#4f46e5" : done ? "#059669" : "#f1f5f9", color: (active || done) ? "#fff" : "#94a3b8", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" }}>{done ? "✓" : i + 1}</span>
              {s}
            </span>
            {i < steps.length - 1 && <span style={{ width: 22, height: 1, background: "#e2e8f0" }} />}
          </span>
        );
      })}
    </div>
  );
}

export default function NewVersionPage() {
  const navigate = useNavigate();
  const master = useAppStorage().master; // 只读母版，绝不修改

  const [company, setCompany] = useState("");
  const [position, setPosition] = useState("");
  const [jd, setJd] = useState("");

  const canCompile = !!master && !!company.trim() && !!position.trim() && !!jd.trim();

  function onCompile() {
    if (!canCompile) return;
    // 直接进编译管线；管线从 storage 取 master，本页不传/不动 master
    navigate("/compile", { state: { company: company.trim(), position: position.trim(), jd: jd.trim() } });
  }

  // 无母版：本页不该被直达，引导回上传建母版
  if (!master) {
    return (
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "80px 24px", textAlign: "center" }}>
        <div className="serif" style={{ fontSize: 24, fontWeight: 600, marginBottom: 10 }}>先建立母版再编译</div>
        <p style={{ fontSize: 14, color: "#94a3b8", lineHeight: 1.6, marginBottom: 24 }}>
          针对岗位编译需要一份母版作为取材来源。请先上传简历建立母版。
        </p>
        <button className="pbtn" style={primaryBtn} onClick={() => navigate("/upload")}>
          上传简历，创建母版
        </button>
      </div>
    );
  }

  const wordCount = master.segments.reduce((sum, s) => sum + s.content.length, 0);

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "32px 24px 60px" }}>
      <style>{`
        .card { background:#fff; border:1px solid #e2e8f0; border-radius:16px; box-shadow: 0 1px 2px -1px rgb(15 23 42/.08), 0 4px 12px -2px rgb(15 23 42/.06); }
        .pbtn { transition: box-shadow .15s, transform .15s; } .pbtn:hover:not(:disabled) { box-shadow: 0 6px 18px rgba(79,70,229,.35); transform: translateY(-1px); }
        .lnk { transition: color .15s; } .lnk:hover { color:#4f46e5; }
        .infield:focus-within { border-color:#a5b4fc; }
        textarea:focus { border-color:#a5b4fc; }
      `}</style>

      <button className="lnk" onClick={() => navigate("/")} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 13, color: "#64748b", marginBottom: 18 }}>
        <ArrowLeft size={15} /> 返回首页
      </button>

      <StepBar current={0} />

      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div className="serif" style={{ fontSize: 28, fontWeight: 600 }}>针对新岗位编译</div>
        <div style={{ fontSize: 14, color: "#94a3b8", marginTop: 8 }}>用现有母版编译新岗位 —— 只需粘贴目标 JD，无需重新上传简历</div>
      </div>

      {/* 取材来源：母版（只读展示，强化"母版不变"心智）*/}
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", borderRadius: 14, border: "1.5px solid #c7d2fe", background: "linear-gradient(135deg,#ffffff,#f5f3ff)", marginBottom: 20 }}>
        <div style={{ width: 42, height: 42, borderRadius: 11, background: "linear-gradient(135deg,#6366f1,#4f46e5)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 4px 12px rgba(79,70,229,.3)" }}>
          <Database size={20} color="#fff" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#334155" }}>{master.basicInfo.name || "我"}的简历母版</div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>{master.segments.length} 段经历 · {wordCount} 字 · 编译从这里取材，母版保持完整不变</div>
        </div>
        <button className="lnk" onClick={() => navigate("/master")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12.5, color: "#6366f1", fontWeight: 500, flexShrink: 0 }}>
          查看 / 补充
        </button>
      </div>

      {/* 目标岗位输入 */}
      <div className="card" style={{ padding: 24 }}>
        <div style={{ fontSize: 14.5, fontWeight: 600, color: "#334155", marginBottom: 16 }}>目标岗位</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 10 }}>
            <div className="infield" style={inWrap}><Building2 size={15} color="#94a3b8" /><input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="公司" style={inStyle} /></div>
            <div className="infield" style={inWrap}><Briefcase size={15} color="#94a3b8" /><input value={position} onChange={(e) => setPosition(e.target.value)} placeholder="职位" style={inStyle} /></div>
          </div>
          <textarea
            value={jd}
            onChange={(e) => setJd(e.target.value)}
            placeholder="粘贴完整 JD 内容…（内容越完整，匹配分析越准）"
            style={{ width: "100%", minHeight: 200, border: "1px solid #e2e8f0", borderRadius: 11, padding: 13, fontSize: 13.5, lineHeight: 1.6, color: "#1e293b", outline: "none", resize: "vertical", transition: "border-color .15s" }}
          />
        </div>
      </div>

      <div style={{ display: "flex", gap: 7, marginTop: 14, fontSize: 12, color: "#6366f1", background: "#eef2ff", padding: "10px 14px", borderRadius: 10, lineHeight: 1.5 }}>
        <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
        本次编译会生成一个新子版，针对此岗位取舍 / 改写经历。母版不会被改动。
      </div>

      {/* 编译按钮 */}
      <div className="card" style={{ marginTop: 20, padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div style={{ fontSize: 13, color: "#64748b" }}>
          {canCompile ? "已就绪 · 点击开始针对此岗位编译" : "填写公司、职位和 JD 即可开始"}
        </div>
        <button className="pbtn" disabled={!canCompile} onClick={onCompile} style={{ ...primaryBtn, padding: "12px 28px", fontSize: 14.5, opacity: canCompile ? 1 : 0.5, cursor: canCompile ? "pointer" : "not-allowed", background: canCompile ? primaryBtn.background : "#cbd5e1", boxShadow: canCompile ? "0 4px 14px rgba(79,70,229,.3)" : "none", flexShrink: 0 }}>
          <Sparkles size={16} /> 开始编译
        </button>
      </div>
    </div>
  );
}

const inWrap: CSSProperties = { flex: 1, display: "flex", alignItems: "center", gap: 8, border: "1px solid #e2e8f0", borderRadius: 10, padding: "9px 11px", transition: "border-color .15s" };
const inStyle: CSSProperties = { border: "none", outline: "none", fontSize: 13.5, width: "100%", background: "transparent", color: "#1e293b" };
const primaryBtn: CSSProperties = { display: "flex", alignItems: "center", gap: 7, background: "linear-gradient(135deg,#6366f1,#4f46e5)", color: "#fff", border: "none", borderRadius: 11, padding: "11px 22px", fontSize: 14, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", boxShadow: "0 2px 8px rgba(79,70,229,.25)" };
