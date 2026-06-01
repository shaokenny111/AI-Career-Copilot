// ============================================================================
// Upload 上传页 + JD 输入（Phase 3）
// ----------------------------------------------------------------------------
// 视觉严格参考 _refs/ui/upload_final_v2.jsx：两栏等高、虚线拖拽区（dragover 变紫）、
// 公司+职位+JD 三输入、上传后的母版说明、"准备就绪"卡片包裹编译按钮、按钮门控。
//
// 功能接入（真实链路，非写死）：
//   1. 文件/粘贴 → fileParser.parseFile / parseImageBlob 解析出纯文本
//   2. parseResumeText(#7) 把纯文本切成 BasicInfo + ParsedSegment[]（每段强制带
//      timeRange + isCurrent）
//   3. classifyResumeType(#4) 用真实统计特征识别 A/B/C，按结果分流：
//        A/B → "开始编译"（Phase 5 占位跳转 /compile）
//        C   → 橙色引导条 + "进入引导"（跳 /guidance）
//   4. 解析结果固化成 Master 写入 storage
//
// 注：本页内容渲染在公共 Layout 的 <Outlet/> 内，Header/光晕由 Layout 提供，
// 这里不再重复 Header；保留 ref 的步骤条作为线性流程提示。
// ============================================================================

import {
  useMemo, useRef, useState,
  type CSSProperties, type DragEvent, type ClipboardEvent,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  Upload, FileText, Sparkles, ArrowRight, X, Building2, Briefcase,
  Lightbulb, CheckCircle2, CircleHelp, CircleAlert, Info, Loader2,
  ClipboardCheck, ChevronDown, ChevronRight,
} from "lucide-react";
import { parseFile, parseImageBlob, getPastedImage } from "../lib/fileParser";
import { parseResumeText, classifyResumeType } from "../lib/gemini";
import { buildClassifyInput, buildMaster } from "../lib/resumeIntake";
import { loadStorage, saveStorage } from "../lib/storage";
import type {
  Master,
  Segment,
  ResumeType,
  ResumeTypeOutput,
} from "../types";

const SEG_TYPE_LABEL: Record<Segment["type"], string> = {
  work: "工作", internship: "实习", project: "项目", education: "教育",
  skill: "技能", certificate: "证书", award: "获奖", activity: "活动", other: "其他",
};

const TYPES: Record<
  ResumeType,
  {
    label: string;
    color: string;
    bg: string;
    border: string;
    icon: typeof CheckCircle2;
    desc: string;
    action: string;
  }
> = {
  A_master: {
    label: "完整母版", color: "#059669", bg: "#ecfdf5", border: "#a7f3d0",
    icon: CheckCircle2, desc: "经历完整，可直接编译", action: "将直接进入工作台",
  },
  B_compiled: {
    label: "已精简版", color: "#d97706", bg: "#fffbeb", border: "#fde68a",
    icon: CircleHelp, desc: "像是为某次投递精简过，建议补充被删的经历", action: "编译时会提示补充母版",
  },
  C_incomplete: {
    label: "半成品 / 应届", color: "#e11d48", bg: "#fff1f2", border: "#fecdd3",
    icon: CircleAlert, desc: "信息较少，建议走引导流程逐步建立母版", action: "将进入应届生引导",
  },
};

type Status = "idle" | "parsing" | "done" | "error";

// 线性流程步骤条（ref 顶部，移到内容区）
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

export default function UploadPage() {
  const navigate = useNavigate();

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [master, setMaster] = useState<Master | null>(null);
  const [classification, setClassification] = useState<ResumeTypeOutput | null>(null);
  const [rawText, setRawText] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);

  const [company, setCompany] = useState("");
  const [position, setPosition] = useState("");
  const [jd, setJd] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 母版只建一次：已有母版时给出提示（重新上传会覆盖）。
  // TODO(Phase later): 完善"已有母版"的引导（去补充而非覆盖）/ 覆盖前二次确认。
  const hadMaster = useMemo(() => !!loadStorage().master, []);

  const type = classification?.resumeType ?? null;
  const t = type ? TYPES[type] : null;
  const isC = type === "C_incomplete";
  const uploaded = status === "done" && !!master;
  const canCompile = uploaded && !!jd.trim() && !!company.trim() && !!position.trim();

  const wordCount = rawText.replace(/\s/g, "").length;
  const segCount = master?.segments.length ?? 0;

  // 写回整份 Master 到 storage（保留其它字段）
  function persistMaster(m: Master) {
    const store = loadStorage();
    saveStorage({ ...store, master: m });
  }

  // 轻量核对：编辑某段的字段后，更新 updatedAt 并即时落盘
  function editSegment(id: string, patch: Partial<Segment>) {
    setMaster((prev) => {
      if (!prev) return prev;
      const now = new Date().toISOString();
      const next: Master = {
        ...prev,
        updatedAt: now,
        segments: prev.segments.map((s) =>
          s.id === id ? { ...s, ...patch, updatedAt: now } : s,
        ),
      };
      persistMaster(next);
      return next;
    });
  }

  function editName(name: string) {
    setMaster((prev) => {
      if (!prev) return prev;
      const next: Master = {
        ...prev,
        basicInfo: { ...prev.basicInfo, name },
        updatedAt: new Date().toISOString(),
      };
      persistMaster(next);
      return next;
    });
  }

  // ---------------- 核心链路：纯文本 → 解析 → 识别 → 落盘 ----------------

  async function processText(text: string, name: string) {
    const trimmed = text.trim();
    if (trimmed.length < 30) {
      setStatus("error");
      setError("没读到足够的简历内容，请换一份文件或直接粘贴文本。");
      return;
    }
    setStatus("parsing");
    setError(null);
    setFileName(name);
    setRawText(trimmed);

    try {
      // #7 解析成结构化 segments（每段带 timeRange + isCurrent）
      const p = await parseResumeText({ rawText: trimmed });
      // #4 用真实统计特征识别 A/B/C（不写死）
      const classifyInput = buildClassifyInput(trimmed, p);
      const c = await classifyResumeType(classifyInput);

      // 解析结果固化成 Master 写入 storage
      const m = buildMaster(p, c.resumeType);
      persistMaster(m);

      setMaster(m);
      setClassification(c);
      setReviewOpen(false);
      setStatus("done");
    } catch (e) {
      console.error("[Upload] parse/classify failed", e);
      setStatus("error");
      setError("解析失败了，请重试或换一份文件。");
    }
  }

  async function handleFile(file: File) {
    setStatus("parsing");
    setError(null);
    setFileName(file.name);
    try {
      const text = await parseFile(file);
      await processText(text, file.name);
    } catch (e) {
      console.error("[Upload] file read failed", e);
      setStatus("error");
      setError("文件读取失败，请确认是 PDF / Word / 图片，或直接粘贴文本。");
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  async function onPaste(e: ClipboardEvent) {
    const img = getPastedImage(e.nativeEvent);
    if (img) {
      e.preventDefault();
      setStatus("parsing");
      setError(null);
      setFileName("粘贴的图片");
      try {
        const text = await parseImageBlob(img);
        await processText(text, "粘贴的图片");
      } catch {
        setStatus("error");
        setError("图片识别失败，请重试或直接粘贴文本。");
      }
      return;
    }
    const text = e.clipboardData.getData("text");
    if (text && text.trim().length >= 30) {
      e.preventDefault();
      void processText(text, "粘贴的文本");
    }
  }

  function reset() {
    setStatus("idle");
    setError(null);
    setMaster(null);
    setClassification(null);
    setRawText("");
    setFileName("");
    setReviewOpen(false);
    // 撤销本次创建的母版（母版只建一次，移除上传即丢弃草稿母版）
    const store = loadStorage();
    saveStorage({ ...store, master: null });
  }

  function onCompile() {
    if (!canCompile) return;
    // Phase 5 编译流程占位：先把 JD 透传过去，落地后接真实编译管线
    navigate("/compile", { state: { company, position, jd } });
  }

  function onGuidance() {
    if (!canCompile) return;
    navigate("/guidance", { state: { company, position, jd } });
  }

  const parsing = status === "parsing";

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px 60px" }}>
      <style>{`
        .card { background:#fff; border:1px solid #e2e8f0; border-radius:16px; box-shadow: 0 1px 2px -1px rgb(15 23 42/.08), 0 4px 12px -2px rgb(15 23 42/.06); }
        .pbtn { transition: all .15s; } .pbtn:hover:not(:disabled) { box-shadow: 0 6px 18px rgba(79,70,229,.35); transform: translateY(-1px); }
        .drop { transition: all .2s; } .drop:hover { border-color:#a5b4fc; background:#f5f3ff; }
        textarea:focus, .infield:focus-within { border-color:#a5b4fc; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
      `}</style>

      <StepBar current={0} />

      <div style={{ textAlign: "center", marginBottom: 34 }}>
        <div className="serif" style={{ fontSize: 30, fontWeight: 600 }}>把简历编译成投递版本</div>
        <div style={{ fontSize: 14, color: "#94a3b8", marginTop: 10 }}>上传你的完整简历（母版），输入目标岗位，AI 帮你针对性优化</div>
      </div>

      {hadMaster && !uploaded && (
        <div style={{ marginBottom: 18, display: "flex", gap: 8, fontSize: 12.5, color: "#b45309", background: "#fffbeb", border: "1px solid #fde68a", padding: "10px 14px", borderRadius: 10, lineHeight: 1.5 }}>
          <Info size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          你已经有一份母版了。重新上传会覆盖现有母版——若只想补充经历，请回首页从母版进入编辑。
        </div>
      )}

      {/* 两栏等高 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24, alignItems: "stretch" }}>
        {/* 左：上传 */}
        <div className="card" style={{ padding: 24, display: "flex", flexDirection: "column" }}>
          <div style={stepLabel}><span style={stepNum}>1</span> 上传简历（母版）</div>

          {!uploaded ? (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", marginTop: 16 }}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,image/*,.txt"
                style={{ display: "none" }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ""; }}
              />
              <div
                className="drop"
                tabIndex={0}
                onClick={() => !parsing && fileInputRef.current?.click()}
                onPaste={onPaste}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                style={{
                  flex: 1, border: `2px dashed ${dragOver ? "#6366f1" : "#cbd5e1"}`, borderRadius: 14,
                  padding: 16, textAlign: "center", cursor: parsing ? "default" : "pointer",
                  background: dragOver ? "#eef2ff" : "#fafbfc", display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center", minHeight: 180, outline: "none",
                }}
              >
                {parsing ? (
                  <>
                    <Loader2 size={26} color="#4f46e5" className="spin" />
                    <div style={{ fontSize: 14, color: "#475569", fontWeight: 500, marginTop: 12 }}>正在解析并识别简历…</div>
                    <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 5 }}>提取经历、判断类型，稍候片刻</div>
                  </>
                ) : (
                  <>
                    <div style={{ width: 46, height: 46, borderRadius: 12, background: "#eef2ff", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
                      <Upload size={22} color="#4f46e5" />
                    </div>
                    <div style={{ fontSize: 14, color: "#475569", fontWeight: 500 }}>{dragOver ? "松手即可上传" : "拖拽或点击上传"}</div>
                    <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 5 }}>PDF / Word / 图片，也可直接粘贴文本</div>
                  </>
                )}
              </div>
              {error && (
                <div style={{ marginTop: 12, fontSize: 12.5, color: "#e11d48", background: "#fff1f2", border: "1px solid #fecdd3", padding: "9px 12px", borderRadius: 9, lineHeight: 1.5 }}>
                  {error}
                </div>
              )}
            </div>
          ) : (
            <div style={{ flex: 1, marginTop: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "13px 15px", background: "#fafbfc", borderRadius: 11, border: "1px solid #e2e8f0" }}>
                <div style={{ width: 38, height: 38, borderRadius: 9, background: "#eef2ff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><FileText size={18} color="#4f46e5" /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fileName || "已上传简历"}</div>
                  <div style={{ fontSize: 11.5, color: "#94a3b8" }}>已解析 · {wordCount} 字 · {segCount} 段经历</div>
                </div>
                <button onClick={reset} style={{ border: "none", background: "transparent", cursor: "pointer", padding: 4 }} title="移除并重新上传"><X size={16} color="#94a3b8" /></button>
              </div>

              {t && (
                <div style={{ marginTop: 14, padding: 15, borderRadius: 11, background: t.bg, border: `1px solid ${t.border}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
                    <t.icon size={15} color={t.color} /><span style={{ fontSize: 12.5, fontWeight: 600, color: t.color }}>AI 识别：{t.label}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: "#475569", lineHeight: 1.55 }}>{t.desc}</div>
                  {classification && classification.signals.length > 0 && (
                    <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 11.5, color: "#64748b", lineHeight: 1.7 }}>
                      {classification.signals.map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  )}
                </div>
              )}

              {/* 母版只建一次说明 */}
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
            <textarea
              value={jd}
              onChange={(e) => setJd(e.target.value)}
              placeholder="粘贴完整 JD 内容…（内容越完整，匹配分析越准）"
              style={{ flex: 1, width: "100%", minHeight: 150, border: "1px solid #e2e8f0", borderRadius: 11, padding: 13, fontSize: 13.5, lineHeight: 1.6, color: "#1e293b", outline: "none", resize: "vertical", transition: "border-color .15s" }}
            />
          </div>
        </div>
      </div>

      {/* 解析结果轻量核对：让用户确认每段的标题与时间字段（铁律所在） */}
      {uploaded && master && (
        <div className="card" style={{ padding: 0, marginBottom: 24, overflow: "hidden" }}>
          <button
            onClick={() => setReviewOpen((o) => !o)}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "16px 22px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}
          >
            <ClipboardCheck size={17} color="#4f46e5" />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#334155" }}>核对解析结果</div>
              <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
                共 {master.segments.length} 段经历 · 确认标题和时间无误，编译会更准（可跳过）
              </div>
            </div>
            {reviewOpen ? <ChevronDown size={18} color="#94a3b8" /> : <ChevronRight size={18} color="#94a3b8" />}
          </button>

          {reviewOpen && (
            <div style={{ padding: "4px 22px 22px", borderTop: "1px solid #eef2f7" }}>
              {/* 基本信息：姓名 */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "16px 0 18px" }}>
                <span style={{ fontSize: 12.5, color: "#64748b", width: 56, flexShrink: 0 }}>姓名</span>
                <input
                  value={master.basicInfo.name}
                  onChange={(e) => editName(e.target.value)}
                  placeholder="未识别到姓名"
                  style={{ ...reviewInput, maxWidth: 220 }}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {master.segments.map((s) => (
                  <div key={s.id} style={{ border: "1px solid #eef2f7", borderRadius: 11, padding: 14, background: "#fcfcfd" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: "#4338ca", background: "#eef2ff", border: "1px solid #e0e7ff", padding: "2px 9px", borderRadius: 99 }}>
                        {SEG_TYPE_LABEL[s.type]}
                      </span>
                      <input
                        value={s.title}
                        onChange={(e) => editSegment(s.id, { title: e.target.value })}
                        placeholder="经历标题"
                        style={{ ...reviewInput, flex: 1, fontWeight: 500 }}
                      />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 12, color: "#94a3b8" }}>时间</span>
                      <input
                        value={s.timeRange.start}
                        onChange={(e) => editSegment(s.id, { timeRange: { ...s.timeRange, start: e.target.value } })}
                        placeholder="YYYY-MM"
                        style={{ ...reviewInput, width: 92 }}
                      />
                      <span style={{ color: "#cbd5e1" }}>~</span>
                      <input
                        value={s.isCurrent ? "present" : s.timeRange.end}
                        disabled={s.isCurrent}
                        onChange={(e) => editSegment(s.id, { timeRange: { ...s.timeRange, end: e.target.value } })}
                        placeholder="YYYY-MM"
                        style={{ ...reviewInput, width: 92, opacity: s.isCurrent ? 0.5 : 1 }}
                      />
                      <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "#475569", cursor: "pointer", marginLeft: 4 }}>
                        <input
                          type="checkbox"
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
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 14, fontSize: 11.5, color: "#94a3b8", lineHeight: 1.5 }}>
                时间字段会直接影响 AI 对你工作年限的判断，建议核对准确。改动已自动保存到母版。
              </div>
            </div>
          )}
        </div>
      )}

      {/* 编译区：C 类走橙色引导，A/B 走编译 */}
      {isC ? (
        <div style={{ borderRadius: 16, border: "1px solid #fed7aa", background: "linear-gradient(135deg,#fffbf5,#fff7ed)", padding: 22, display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "#ffedd5", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Lightbulb size={20} color="#d97706" /></div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14.5, fontWeight: 600, color: "#b45309" }}>建议先走引导流程</div>
            <div style={{ fontSize: 12.5, color: "#92703a", marginTop: 3, lineHeight: 1.5 }}>你的简历信息较少，AI 会根据 JD 提问，帮你一步步补全母版再编译</div>
          </div>
          <button className="pbtn" disabled={!canCompile} onClick={onGuidance} style={{ ...primaryBtn, background: canCompile ? "linear-gradient(135deg,#fb923c,#d97706)" : "#cbd5e1", boxShadow: canCompile ? "0 2px 8px rgba(217,119,6,.3)" : "none", cursor: canCompile ? "pointer" : "not-allowed" }}>进入引导 <ArrowRight size={15} /></button>
        </div>
      ) : (
        <div className="card" style={{ padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <div style={{ fontSize: 13, color: "#64748b" }}>
            {!uploaded ? "上传简历并填写目标岗位后即可编译" : !canCompile ? "再填写公司、职位和 JD 就可以开始" : t ? <>已就绪 · 识别为<b style={{ color: t.color, fontWeight: 600 }}>{t.label}</b>，{t.action}</> : ""}
          </div>
          <button className="pbtn" disabled={!canCompile} onClick={onCompile} style={{ ...primaryBtn, padding: "12px 28px", fontSize: 14.5, opacity: canCompile ? 1 : 0.5, cursor: canCompile ? "pointer" : "not-allowed", background: canCompile ? "linear-gradient(135deg,#6366f1,#4f46e5)" : "#cbd5e1", boxShadow: canCompile ? "0 4px 14px rgba(79,70,229,.3)" : "none", flexShrink: 0 }}>
            <Sparkles size={16} /> 开始编译
          </button>
        </div>
      )}
    </div>
  );
}

const stepLabel: CSSProperties = { display: "flex", alignItems: "center", gap: 9, fontSize: 14.5, fontWeight: 600, color: "#334155" };
const stepNum: CSSProperties = { width: 22, height: 22, borderRadius: 99, background: "linear-gradient(135deg,#6366f1,#4f46e5)", color: "#fff", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center" };
const inWrap: CSSProperties = { flex: 1, display: "flex", alignItems: "center", gap: 8, border: "1px solid #e2e8f0", borderRadius: 10, padding: "9px 11px", transition: "border-color .15s" };
const inStyle: CSSProperties = { border: "none", outline: "none", fontSize: 13.5, width: "100%", background: "transparent", color: "#1e293b" };
const reviewInput: CSSProperties = { border: "1px solid #e2e8f0", borderRadius: 8, padding: "6px 10px", fontSize: 13, color: "#1e293b", outline: "none", background: "#fff" };
const primaryBtn: CSSProperties = { display: "flex", alignItems: "center", gap: 7, color: "#fff", border: "none", borderRadius: 11, padding: "11px 22px", fontSize: 14, fontWeight: 600, cursor: "pointer" };
