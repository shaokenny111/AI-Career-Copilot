// ============================================================================
// 母版详情 / 编辑页（Phase 8）
// ----------------------------------------------------------------------------
// 首页母版卡「查看 / 补充经历」进入。读取与首页同一数据源（useAppStorage →
// view.master），渲染母版全部段经历，支持查看 + 补充 / 编辑：
//   · 基本信息（姓名 / 邮箱 / 电话 / 城市 / 一句话简介）
//   · 每段经历：类型 / 标题 / 副标题 / 时间（start~end + 在职）/ 正文 / 标签
//   · 新增一段经历、删除一段经历
//
// 所有改动即时落盘（saveStorage，updatedAt 自动刷新），不另造读取逻辑。
// 铁律：母版是事实来源，永远完整保留——本页只增改母版本身，不生成/触碰子版。
// 无母版（直接刷到本页）→ 引导回上传页建母版。
// ============================================================================

import { type CSSProperties, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Plus, Trash2, Database, FileText, User, Sparkles, Info,
} from "lucide-react";
import { loadStorage, saveStorage } from "../lib/storage";
import { useAppStorage } from "../lib/useAppStorage";
import { CheckBox, Select } from "../components/controls";
import type { BasicInfo, Master, Segment, SegmentType } from "../types";

const SEG_TYPES: Array<{ value: SegmentType; label: string }> = [
  { value: "work", label: "工作经历" },
  { value: "internship", label: "实习经历" },
  { value: "project", label: "项目经历" },
  { value: "education", label: "教育背景" },
  { value: "skill", label: "技能特长" },
  { value: "certificate", label: "证书" },
  { value: "award", label: "获奖" },
  { value: "activity", label: "课外活动" },
  { value: "other", label: "其他" },
];

/** 稳定随机 id（与 resumeIntake / compile 同风格，无第三方依赖） */
function genId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function MasterPage() {
  const navigate = useNavigate();
  const view = useAppStorage(); // 与首页同一响应式数据源
  const master = view.master;

  // ---- 落盘助手：写回整份 master，刷新 updatedAt（其它 storage 字段保留）----
  function persist(next: Master) {
    const store = loadStorage();
    saveStorage({ ...store, master: { ...next, updatedAt: new Date().toISOString() } });
  }

  function editBasic(patch: Partial<BasicInfo>) {
    if (!master) return;
    persist({ ...master, basicInfo: { ...master.basicInfo, ...patch } });
  }

  function editSegment(id: string, patch: Partial<Segment>) {
    if (!master) return;
    const now = new Date().toISOString();
    persist({
      ...master,
      segments: master.segments.map((s) =>
        s.id === id ? { ...s, ...patch, updatedAt: now } : s,
      ),
    });
  }

  function addSegment() {
    if (!master) return;
    const now = new Date().toISOString();
    const seg: Segment = {
      id: genId("seg_work"),
      type: "work",
      title: "",
      content: "",
      timeRange: { start: "", end: "" },
      isCurrent: false,
      tags: [],
      createdAt: now,
      updatedAt: now,
    };
    persist({ ...master, segments: [...master.segments, seg] });
  }

  function removeSegment(id: string) {
    if (!master) return;
    persist({ ...master, segments: master.segments.filter((s) => s.id !== id) });
  }

  // ---- 无母版：引导建母版 ----
  if (!master) {
    return (
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "80px 24px", textAlign: "center" }}>
        <div style={{ width: 64, height: 64, margin: "0 auto 20px", borderRadius: 18, background: "linear-gradient(135deg,#6366f1,#4f46e5)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 24px rgba(79,70,229,.3)" }}>
          <FileText size={30} color="#fff" />
        </div>
        <div className="serif" style={{ fontSize: 24, fontWeight: 600, marginBottom: 10 }}>你还没有母版</div>
        <p style={{ fontSize: 14, color: "#94a3b8", lineHeight: 1.6, marginBottom: 24 }}>
          母版是你所有经历的完整集合。先上传一份现有简历，我们帮你解析成结构化经历。
        </p>
        <button className="pbtn" style={primaryBtn} onClick={() => navigate("/upload")}>
          <Plus size={15} /> 上传简历，创建母版
        </button>
      </div>
    );
  }

  const wordCount = master.segments.reduce((sum, s) => sum + s.content.length, 0);

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "32px 24px 80px" }}>
      <style>{`
        .card { background:#fff; border:1px solid #e2e8f0; border-radius:16px; box-shadow: 0 1px 2px -1px rgb(15 23 42/.08), 0 4px 12px -2px rgb(15 23 42/.06); }
        .pbtn { transition: box-shadow .15s, transform .15s; } .pbtn:hover { box-shadow: 0 6px 18px rgba(79,70,229,.35) !important; transform: translateY(-1px); } .pbtn:active { transform: translateY(0); box-shadow: 0 2px 8px rgba(79,70,229,.3) !important; }
        .gbtn { transition: background-color .15s, border-color .15s, box-shadow .15s, color .15s, transform .1s; } .gbtn:hover { background:#f8fafc !important; border-color:#cbd5e1 !important; } .gbtn:active { background:#f1f5f9 !important; transform: translateY(1px); }
        .lnk { transition: color .15s; } .lnk:hover { color:#4f46e5 !important; }
        .seg-del { opacity:0; transition: opacity .15s; }
        .segcard:hover .seg-del { opacity:1; }
        .mi:focus, .mi:focus-within { border-color:#a5b4fc; }
      `}</style>

      {/* 返回 */}
      <button className="lnk" onClick={() => navigate("/")} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 13, color: "#64748b", marginBottom: 18 }}>
        <ArrowLeft size={15} /> 返回首页
      </button>

      {/* 标题区 */}
      <div style={{ ...sideTitle, display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
        <Database size={14} /> 我的母版 · 一切编译的源头
      </div>
      <div className="serif" style={{ fontSize: 27, fontWeight: 600 }}>
        {master.basicInfo.name || "我"}的简历母版
      </div>
      <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 6 }}>
        {master.segments.length} 段经历 · {wordCount} 字 · 改动即时保存，母版始终完整保留
      </div>

      <div style={{ display: "flex", gap: 7, marginTop: 14, padding: "10px 14px", background: "#f5f3ff", borderRadius: 10, fontSize: 12.5, color: "#6366f1", lineHeight: 1.5 }}>
        <Info size={15} style={{ flexShrink: 0, marginTop: 1 }} />
        在这里补充 / 修改的内容会成为以后每次编译的取材来源。子版的取舍不会动母版分毫。
      </div>

      {/* 基本信息 */}
      <div style={{ ...sideTitle, display: "flex", alignItems: "center", gap: 7, margin: "30px 0 12px" }}>
        <User size={14} /> 基本信息
      </div>
      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Field label="姓名">
            <input className="mi" value={master.basicInfo.name} onChange={(e) => editBasic({ name: e.target.value })} placeholder="姓名" style={inStyle} />
          </Field>
          <Field label="城市">
            <input className="mi" value={master.basicInfo.location ?? ""} onChange={(e) => editBasic({ location: e.target.value })} placeholder="所在城市" style={inStyle} />
          </Field>
          <Field label="邮箱">
            <input className="mi" value={master.basicInfo.email} onChange={(e) => editBasic({ email: e.target.value })} placeholder="email@example.com" style={inStyle} />
          </Field>
          <Field label="电话">
            <input className="mi" value={master.basicInfo.phone} onChange={(e) => editBasic({ phone: e.target.value })} placeholder="手机号" style={inStyle} />
          </Field>
          <div style={{ gridColumn: "1 / -1" }}>
            <Field label="一句话简介">
              <input className="mi" value={master.basicInfo.headline ?? ""} onChange={(e) => editBasic({ headline: e.target.value })} placeholder="如：3 年经验的数据分析师，专注金融风控" style={inStyle} />
            </Field>
          </div>
        </div>
      </div>

      {/* 经历段落 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "30px 0 12px" }}>
        <div style={{ ...sideTitle, display: "flex", alignItems: "center", gap: 7 }}>
          <FileText size={14} /> 经历段落 · {master.segments.length} 段
        </div>
        <button className="gbtn" style={ghostBtn} onClick={addSegment}>
          <Plus size={14} /> 补充一段经历
        </button>
      </div>

      {master.segments.length === 0 ? (
        <div className="card" style={{ padding: 28, textAlign: "center", color: "#94a3b8", fontSize: 13.5 }}>
          母版还没有任何经历。点击「补充一段经历」开始添加。
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {master.segments.map((s, i) => (
            <div key={s.id} className="card segcard" style={{ padding: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#cbd5e1" }}>{String(i + 1).padStart(2, "0")}</span>
                <Select
                  value={s.type}
                  onChange={(e) => editSegment(s.id, { type: e.target.value as SegmentType })}
                  style={{ fontSize: 12, fontWeight: 600, color: "#4338ca", background: "#eef2ff", border: "1px solid #e0e7ff", borderRadius: 99, padding: "4px 10px" }}
                >
                  {SEG_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </Select>
                <div style={{ flex: 1 }} />
                <button className="seg-del gbtn" onClick={() => removeSegment(s.id)} title="删除这段经历" style={{ ...ghostBtn, padding: "6px 10px", color: "#e11d48" }}>
                  <Trash2 size={13} /> 删除
                </button>
              </div>

              <Field label="标题">
                <input className="mi" value={s.title} onChange={(e) => editSegment(s.id, { title: e.target.value })} placeholder="如：国元证券 行业研究实习生" style={{ ...inStyle, fontWeight: 500 }} />
              </Field>

              <div style={{ marginTop: 12 }}>
                <Field label="副标题（可选）">
                  <input className="mi" value={s.subtitle ?? ""} onChange={(e) => editSegment(s.id, { subtitle: e.target.value })} placeholder="如：城市 / 项目角色" style={inStyle} />
                </Field>
              </div>

              <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={fieldLabel}>时间</span>
                <input className="mi" value={s.timeRange.start} onChange={(e) => editSegment(s.id, { timeRange: { ...s.timeRange, start: e.target.value } })} placeholder="YYYY-MM" style={{ ...inStyle, width: 100 }} />
                <span style={{ color: "#cbd5e1" }}>~</span>
                <input
                  className="mi"
                  value={s.isCurrent ? "present" : s.timeRange.end}
                  disabled={s.isCurrent}
                  onChange={(e) => editSegment(s.id, { timeRange: { ...s.timeRange, end: e.target.value } })}
                  placeholder="YYYY-MM"
                  style={{ ...inStyle, width: 100, opacity: s.isCurrent ? 0.5 : 1 }}
                />
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "#475569", cursor: "pointer" }}>
                  <CheckBox
                    checked={s.isCurrent}
                    onChange={(e) => {
                      const isCurrent = e.target.checked;
                      editSegment(s.id, {
                        isCurrent,
                        timeRange: { ...s.timeRange, end: isCurrent ? "present" : (s.timeRange.end === "present" ? "" : s.timeRange.end) },
                      });
                    }}
                  />
                  在职 / 进行中
                </label>
              </div>

              <div style={{ marginTop: 12 }}>
                <Field label="正文（完整经历内容）">
                  <textarea
                    className="mi"
                    value={s.content}
                    onChange={(e) => editSegment(s.id, { content: e.target.value })}
                    placeholder="完整描述这段经历做了什么。写得越完整、越真实，编译时改写越准。"
                    style={{ ...inStyle, minHeight: 96, lineHeight: 1.7, resize: "vertical", fontFamily: "inherit" }}
                  />
                </Field>
              </div>

              <div style={{ marginTop: 12 }}>
                <Field label="标签（逗号分隔，给 AI 判断相关性用）">
                  <input
                    className="mi"
                    value={s.tags.join("、")}
                    onChange={(e) => editSegment(s.id, { tags: e.target.value.split(/[、,，]/).map((t) => t.trim()).filter(Boolean) })}
                    placeholder="如：数据分析、行业研究、SQL"
                    style={inStyle}
                  />
                </Field>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 去编译 */}
      <div className="card" style={{ marginTop: 24, padding: "18px 22px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.5 }}>
          母版就绪后，针对具体岗位编译只需输入新 JD，无需重新上传。
        </div>
        <button className="pbtn" style={primaryBtn} onClick={() => navigate("/new-version")}>
          <Sparkles size={15} /> 针对新岗位编译
        </button>
      </div>
    </div>
  );
}

// ============================ 小组件 ============================

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <span style={fieldLabel}>{label}</span>
      <div style={{ marginTop: 5 }}>{children}</div>
    </label>
  );
}

// ============================ 样式常量 ============================

const sideTitle: CSSProperties = { fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: ".06em" };
const fieldLabel: CSSProperties = { fontSize: 12, color: "#94a3b8", fontWeight: 500 };
const inStyle: CSSProperties = { width: "100%", border: "1px solid #e2e8f0", borderRadius: 9, padding: "9px 11px", fontSize: 13.5, color: "#1e293b", outline: "none", background: "#fff", transition: "border-color .15s" };
const primaryBtn: CSSProperties = { display: "flex", alignItems: "center", gap: 6, background: "linear-gradient(135deg,#6366f1,#4f46e5)", color: "#fff", border: "none", borderRadius: 10, padding: "10px 16px", fontSize: 13.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", boxShadow: "0 2px 8px rgba(79,70,229,.25)" };
const ghostBtn: CSSProperties = { display: "flex", alignItems: "center", gap: 6, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 9, padding: "9px 14px", fontSize: 13, color: "#475569", cursor: "pointer", whiteSpace: "nowrap" };
