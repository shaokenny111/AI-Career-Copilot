// ============================================================================
// MyResume 首页（hub）
// ----------------------------------------------------------------------------
// 视觉严格参考 _refs/ui/my_resume_final_v3.jsx：母版区（主色描边 + 经历预览）、
// 子版库（四级匹配度圆环 + 分级标签 + 状态 + 时间）、四级图例、母版-子版联动提示，
// 以及无母版时的空状态。数据来自 storage.ts。
// ============================================================================

import { useMemo, type CSSProperties, type FC } from "react";
import { useNavigate } from "react-router-dom";
import {
  FileText, Pencil, Sparkles, MoreHorizontal, FileDown, Eye, Clock,
  CheckCircle2, FileEdit, Layers, Database, ArrowRight, RefreshCw, Plus,
} from "lucide-react";
import { loadStorage } from "../lib/storage";
import { useAppStorage } from "../lib/useAppStorage";
import { matchTier } from "../lib/matchTier";
import { formatRelativeDate } from "../lib/datetime";
import MiniRing from "../components/MiniRing";
import type { CompiledVersion } from "../types";

const STATUS = {
  applied: { label: "已投递", color: "#059669", bg: "#ecfdf5", border: "#a7f3d0", icon: CheckCircle2 },
  draft: { label: "草稿", color: "#94a3b8", bg: "#f1f5f9", border: "#e2e8f0", icon: FileEdit },
} as const;

export default function HomePage() {
  const navigate = useNavigate();
  const view = useAppStorage(); // 响应式：投递标记等变更实时反映
  const master = view.master;

  // 子版按最近更新排序，最新者置顶
  const versions = useMemo(
    () =>
      [...view.compiledVersions].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      ),
    [view.compiledVersions],
  );

  return (
    <div style={{ maxWidth: 880, margin: "0 auto", padding: "40px 24px 80px" }}>
      <style>{`
        .card { background:#fff; border:1px solid #e2e8f0; border-radius:16px; box-shadow: 0 1px 2px -1px rgb(15 23 42/.08), 0 4px 12px -2px rgb(15 23 42/.06); }
        .gbtn { transition: all .15s; } .gbtn:hover { background:#f8fafc; border-color:#cbd5e1; }
        .pbtn { transition: all .15s; } .pbtn:hover { box-shadow: 0 6px 18px rgba(79,70,229,.35); transform: translateY(-1px); }
        .vcard { transition: transform .2s, box-shadow .2s, border-color .2s; cursor:pointer; }
        .vcard:hover { transform: translateY(-2px); box-shadow: 0 8px 22px rgba(15,23,42,.1) !important; border-color:#c7d2fe !important; }
        .vcard .acts { opacity:.55; transition: opacity .15s; }
        .vcard:hover .acts { opacity:1; }
        .ibtn { transition: background .15s, border-color .15s; }
        .ibtn:hover { background:#eef2ff; border-color:#c7d2fe; }
        .ibtn:active { background:#e0e7ff; }
        .mtag { transition: all .15s; }
      `}</style>

      {master ? (
        <>
          <div style={{ marginBottom: 30 }}>
            <div className="serif" style={{ fontSize: 28, fontWeight: 600 }}>
              你好，{master.basicInfo.name}
            </div>
            <div style={{ fontSize: 14, color: "#94a3b8", marginTop: 6 }}>
              用母版编译新岗位，或回看已投递的版本
            </div>
          </div>

          <MasterCard master={master} onCompile={() => navigate("/new-version")} onEdit={() => navigate("/master")} />

          <VersionsLibrary versions={versions} />
        </>
      ) : (
        <EmptyState onUpload={() => navigate("/upload")} />
      )}
    </div>
  );
}

// ============================ 母版区 ============================

function MasterCard({
  master,
  onCompile,
  onEdit,
}: {
  master: NonNullable<ReturnType<typeof loadStorage>["master"]>;
  onCompile: () => void;
  onEdit: () => void;
}) {
  const wordCount = master.segments.reduce((sum, s) => sum + s.content.length, 0);
  const segTitles = master.segments.map((s) => s.title);

  return (
    <>
      <div style={{ ...sideTitle, display: "flex", alignItems: "center", gap: 7, marginBottom: 12 }}>
        <Database size={14} /> 我的母版 · 一切编译的源头
      </div>
      <div
        style={{
          borderRadius: 18, border: "1.5px solid #c7d2fe",
          background: "linear-gradient(135deg,#ffffff,#f5f3ff)",
          boxShadow: "0 4px 20px rgba(79,70,229,.1)", padding: 28, marginBottom: 44,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 22 }}>
          <div
            style={{
              width: 64, height: 64, borderRadius: 16,
              background: "linear-gradient(135deg,#6366f1,#4f46e5)",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, boxShadow: "0 4px 12px rgba(79,70,229,.3)",
            }}
          >
            <FileText size={30} color="#fff" />
          </div>
          <div style={{ flex: 1 }}>
            <div className="serif" style={{ fontSize: 21, fontWeight: 600 }}>
              {master.basicInfo.name}的简历母版
            </div>
            <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 5 }}>
              {master.segments.length} 段经历 · {wordCount} 字 · 最后更新于 {formatRelativeDate(master.updatedAt)}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 14 }}>
              {segTitles.map((m) => (
                <span
                  key={m}
                  className="mtag"
                  style={{
                    fontSize: 12, color: "#4338ca", background: "#eef2ff",
                    border: "1px solid #e0e7ff", padding: "3px 10px", borderRadius: 99,
                  }}
                >
                  {m}
                </span>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 9, flexShrink: 0 }}>
            <button className="pbtn" style={primaryBtn} onClick={onCompile}>
              <Sparkles size={15} /> 针对新岗位编译
            </button>
            <button className="gbtn" style={ghostBtn} onClick={onEdit}>
              <Pencil size={14} /> 查看 / 补充经历
            </button>
          </div>
        </div>
        <div
          style={{
            fontSize: 12.5, color: "#94a3b8", marginTop: 18, paddingTop: 16,
            borderTop: "1px solid #e9ecfb", lineHeight: 1.5,
          }}
        >
          母版是你所有经历的完整集合，每次编译都从这里取材，始终完整保留 —— 子版的取舍不会动它分毫
        </div>
      </div>
    </>
  );
}

// ============================ 子版库 ============================

function VersionsLibrary({ versions }: { versions: CompiledVersion[] }) {
  return (
    <>
      <div style={{ ...sideTitle, display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
        <Layers size={14} /> 子版库 · 已编译 {versions.length} 个岗位
      </div>
      <div style={{ fontSize: 12.5, color: "#cbd5e1", marginBottom: 14 }}>
        每个投递过的岗位都在这，点击可回看、微调或重新导出
      </div>

      {versions.length === 0 ? (
        <div
          className="card"
          style={{ padding: 28, textAlign: "center", color: "#94a3b8", fontSize: 13.5 }}
        >
          还没有子版。点击母版区的「针对新岗位编译」，编译你的第一个投递版本。
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {versions.map((v, i) => (
            <VersionCard key={v.id} v={v} isLatest={i === 0} />
          ))}
        </div>
      )}

      {/* 四级图例 */}
      <div
        style={{
          display: "flex", justifyContent: "center", gap: 16, marginTop: 18,
          fontSize: 11.5, color: "#94a3b8", flexWrap: "wrap",
        }}
      >
        <Legend c="#e11d48" t="<60 差距较大" />
        <Legend c="#d97706" t="60-70 建议改进" />
        <Legend c="#059669" t="70-80 基本匹配" />
        <Legend c="#4f46e5" t="80+ 强匹配" />
      </div>

      {/* 母版-子版联动 */}
      <div
        style={{
          marginTop: 22, padding: "14px 18px", borderRadius: 12, background: "#fafbff",
          border: "1px dashed #e0e7ff", display: "flex", alignItems: "center", gap: 10,
          fontSize: 13, color: "#6366f1",
        }}
      >
        <RefreshCw size={15} style={{ flexShrink: 0 }} />
        母版修改后，可一键重新编译所有子版，让每个投递版本都用上最新经历
      </div>
    </>
  );
}

const VersionCard: FC<{ v: CompiledVersion; isLatest: boolean }> = ({ v, isLatest }) => {
  const navigate = useNavigate();
  const t = matchTier(v.gapAnalysis.overallScore);
  const statusKey = v.applicationMark.applied ? "applied" : "draft";
  const st = STATUS[statusKey];
  const StIcon = st.icon;
  const appliedDate = v.applicationMark.appliedAt
    ? formatRelativeDate(v.applicationMark.appliedAt)
    : null;

  return (
    <div
      className="card vcard"
      onClick={() => navigate(`/workbench/${v.id}`)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate(`/workbench/${v.id}`); } }}
      style={{
        padding: 18, display: "flex", alignItems: "center", gap: 18,
        borderColor: t.border, borderWidth: 1.5,
        boxShadow: `0 1px 2px -1px rgb(15 23 42/.08), 0 4px 12px -2px ${t.color}14`,
      }}
    >
      <MiniRing value={v.gapAnalysis.overallScore} color={t.color} colorLight={t.light} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 15.5, fontWeight: 600 }}>
            {v.jobDescription.company} · {v.jobDescription.position}
          </span>
          {isLatest && (
            <span style={{ fontSize: 10.5, fontWeight: 600, color: "#4f46e5", background: "#eef2ff", padding: "2px 7px", borderRadius: 99 }}>
              最新
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: t.color, background: t.bg, border: `1px solid ${t.border}`, padding: "2px 9px", borderRadius: 99 }}>
            {t.label}
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, color: st.color, background: st.bg, border: `1px solid ${st.border}`, padding: "2px 8px", borderRadius: 99 }}>
            <StIcon size={11} /> {st.label}
          </span>
          <span style={{ fontSize: 12, color: "#94a3b8", display: "inline-flex", alignItems: "center", gap: 5 }}>
            <Clock size={11} /> {formatRelativeDate(v.updatedAt)}
            {appliedDate && ` · 投递于 ${appliedDate}`}
          </span>
        </div>
      </div>
      <div className="acts" style={{ display: "flex", gap: 6, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
        <button className="ibtn" style={iconBtn} title="查看 / 微调" aria-label="查看 / 微调" onClick={() => navigate(`/workbench/${v.id}`)}><Eye size={16} color="#64748b" /></button>
        <button className="ibtn" style={iconBtn} title="导出 / 完成页" aria-label="导出 / 完成页" onClick={() => navigate(`/complete/${v.id}`)}><FileDown size={16} color="#64748b" /></button>
        <button className="ibtn" style={iconBtn} title="更多（即将支持）" aria-label="更多"><MoreHorizontal size={16} color="#64748b" /></button>
      </div>
      <ArrowRight size={16} color="#cbd5e1" style={{ flexShrink: 0 }} />
    </div>
  );
}

// ============================ 空状态 ============================

function EmptyState({ onUpload }: { onUpload: () => void }) {
  return (
    <div style={{ padding: "48px 0 24px", textAlign: "center" }}>
      <div
        style={{
          width: 72, height: 72, margin: "0 auto 22px", borderRadius: 20,
          background: "linear-gradient(135deg,#6366f1,#4f46e5)",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 8px 24px rgba(79,70,229,.3)",
        }}
      >
        <FileText size={34} color="#fff" />
      </div>
      <div className="serif" style={{ fontSize: 26, fontWeight: 600, marginBottom: 10 }}>
        建立你的简历母版
      </div>
      <div style={{ fontSize: 14, color: "#94a3b8", maxWidth: 460, margin: "0 auto 26px", lineHeight: 1.6 }}>
        母版是你所有经历的完整集合，是之后每次针对岗位编译投递版的源头。
        上传一份现有简历，我们会帮你解析成结构化的经历。
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
        <button className="pbtn" style={primaryBtn} onClick={onUpload}>
          <Plus size={15} /> 上传简历，创建母版
        </button>
      </div>
    </div>
  );
}

function Legend({ c, t }: { c: string; t: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span style={{ width: 8, height: 8, borderRadius: 99, background: c }} />
      {t}
    </span>
  );
}

// ============================ 样式常量（对齐 _refs）============================

const sideTitle: CSSProperties = {
  fontSize: 11, fontWeight: 600, color: "#64748b",
  textTransform: "uppercase", letterSpacing: ".06em",
};
const primaryBtn: CSSProperties = {
  display: "flex", alignItems: "center", gap: 6,
  background: "linear-gradient(135deg,#6366f1,#4f46e5)", color: "#fff",
  border: "none", borderRadius: 10, padding: "10px 16px", fontSize: 13.5,
  fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
  boxShadow: "0 2px 8px rgba(79,70,229,.25)",
};
const ghostBtn: CSSProperties = {
  display: "flex", alignItems: "center", gap: 6, background: "#fff",
  border: "1px solid #e2e8f0", borderRadius: 10, padding: "9px 14px",
  fontSize: 13, color: "#475569", cursor: "pointer", whiteSpace: "nowrap",
};
const iconBtn: CSSProperties = {
  width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center",
  background: "#fff", border: "1px solid #e2e8f0", borderRadius: 9, cursor: "pointer",
};
