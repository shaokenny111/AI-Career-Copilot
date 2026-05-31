import React, { useState } from "react";
import {
  Sparkles, ArrowRight, SkipForward, Check, Lightbulb, Target,
  CheckCircle2, FileText, ChevronLeft, CircleHelp, Globe
} from "lucide-react";

const QUESTIONS = [
  {
    topic: "数据分析", jdReq: "数据分析能力",
    question: "你处理过一批数据并从中得出结论吗？比如算过账、做过报表、跑过模型？",
    examples: ["金融课程作业用 Excel 建模", "实习时整理行业数据", "学生会统计活动经费", "数学建模处理公开数据", "自学考 CFA 的财务分析"],
  },
  {
    topic: "产品思维", jdReq: "产品思维",
    question: "你做过优化流程、解决某个痛点的事吗？发现某个东西不好用然后改进了它？",
    examples: ["优化社团报名流程", "做了个自动算账的小工具", "改进信息收集表格", "商赛设计一套方案"],
  },
  {
    topic: "跨部门协作", jdReq: "跨部门协作",
    question: "你参加过需要和不同背景的人分工协作的事吗？",
    examples: ["学生会联合办晚会", "跨专业组队参赛", "小组作业统筹分工", "志愿者活动协调排班"],
  },
];

const STAR_RESULT = {
  bullet: "在金融专业课程项目中，使用 Excel 对行业数据进行整理与建模分析，输出可视化报表辅助小组决策。",
  missing: ["可量化的数据规模或分析结论"],
};

/*
 * 开发注记：加载态（STAR 转换中）、错误态（转换失败重试）、移动端兜底页，开发时补。
 */
export default function GuidancePage() {
  const [step, setStep] = useState(0);
  const [answer, setAnswer] = useState("");
  const [phase, setPhase] = useState("ask");
  const [collected, setCollected] = useState(0);

  const q = QUESTIONS[step];
  const total = QUESTIONS.length;
  const isLast = step === total - 1;

  const next = () => { setAnswer(""); setPhase("ask"); setStep((s) => Math.min(s + 1, total - 1)); };
  const accept = () => { setCollected((c) => c + 1); next(); };
  const progress = ((step + (phase === "star" ? 0.6 : 0.1)) / total) * 100;

  return (
    <div style={{ fontFamily: "'IBM Plex Sans',system-ui,sans-serif", background: "#f8fafc", minHeight: "100vh", color: "#1e293b" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=IBM+Plex+Sans:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        .serif { font-family: 'Fraunces', Georgia, serif; }
        .card { background:#fff; border:1px solid #e2e8f0; border-radius:16px; box-shadow: 0 1px 2px -1px rgb(15 23 42/.08), 0 4px 12px -2px rgb(15 23 42/.06); }
        .gbtn { transition: all .15s; } .gbtn:hover { background:#f8fafc; border-color:#cbd5e1; }
        .pbtn { transition: all .15s; } .pbtn:hover:not(:disabled) { box-shadow: 0 6px 18px rgba(79,70,229,.35); transform: translateY(-1px); }
        .ex:hover { border-color:#c7d2fe; background:#f5f3ff; color:#4338ca; }
        textarea:focus { border-color:#a5b4fc; outline:none; }
        @keyframes fadeUp { from { opacity:0; transform: translateY(8px) } to { opacity:1; transform: translateY(0) } }
        .anim { animation: fadeUp .3s ease; }
      `}</style>

      <div style={{ position: "relative" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 280, background: "radial-gradient(55% 55% at 50% 0%, rgba(99,102,241,.08), transparent 70%)", pointerEvents: "none" }} />

        {/* 统一 Header：固定区(logo可点击回首页) + 上下文(建立母版) + 操作区(内部进度 + 中/EN全局) */}
        <header style={{ height: 60, borderBottom: "1px solid #e2e8f0", background: "rgba(255,255,255,.85)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", padding: "0 28px", gap: 14, position: "relative", zIndex: 2 }}>
          <div title="返回首页" style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
            <div style={{ width: 30, height: 30, background: "linear-gradient(135deg,#6366f1,#4f46e5)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(79,70,229,.3)" }}><FileText size={16} color="#fff" /></div>
            <span className="serif" style={{ fontWeight: 600, fontSize: 16 }}>AI Resume Compiler</span>
          </div>
          <span style={{ color: "#cbd5e1", fontSize: 14 }}>·</span>
          <span style={{ fontSize: 13, color: "#94a3b8" }}>建立简历母版</span>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12, fontSize: 13 }}>
            <span style={{ color: "#94a3b8" }}>已收集 <b style={{ color: "#059669", fontWeight: 600 }}>{collected}</b> 段</span>
            <span style={{ color: "#cbd5e1" }}>·</span>
            <span style={{ color: "#4f46e5", fontWeight: 600 }}>第 {step + 1} / {total} 题</span>
            <button className="gbtn" style={{ ...ghostBtn, padding: "7px 11px" }}><Globe size={14} /> 中 / EN</button>
          </div>
        </header>

        <div style={{ maxWidth: 660, margin: "0 auto", padding: "32px 24px 80px", position: "relative", zIndex: 1 }}>
          {/* 进度条 */}
          <div style={{ height: 5, background: "#eef0f5", borderRadius: 99, overflow: "hidden", marginBottom: 28 }}>
            <div style={{ height: "100%", width: `${progress}%`, background: "linear-gradient(90deg,#6366f1,#4f46e5)", borderRadius: 99, transition: "width .4s cubic-bezier(.22,1,.36,1)" }} />
          </div>

          {/* 开场说明（第一题）*/}
          {step === 0 && phase === "ask" && (
            <div style={{ display: "flex", gap: 10, fontSize: 12.5, color: "#6366f1", background: "#eef2ff", padding: "11px 14px", borderRadius: 11, marginBottom: 22, lineHeight: 1.55 }}>
              <Lightbulb size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              你的简历信息较少，AI 根据「字节跳动 · 产品经理」的 JD 提问。用大白话回答即可，AI 会帮你转成简历语言。
            </div>
          )}

          <div key={step + phase} className="anim">
            {/* JD 关联 */}
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 600, color: "#4f46e5", background: "#eef2ff", border: "1px solid #e0e7ff", padding: "4px 11px", borderRadius: 99, marginBottom: 16 }}>
              <Target size={12} /> 对应 JD 要求：{q.jdReq}
            </div>

            {/* 问题 */}
            <div className="serif" style={{ fontSize: 23, fontWeight: 600, lineHeight: 1.45, marginBottom: 18 }}>{q.question}</div>

            {phase === "ask" ? (
              <>
                <div style={{ fontSize: 12.5, color: "#94a3b8", marginBottom: 10 }}>比如这些场景（点击可填入）：</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
                  {q.examples.map((ex) => (
                    <button key={ex} className="ex" onClick={() => setAnswer((a) => a ? a : ex)}
                      style={{ fontSize: 12.5, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 99, padding: "7px 13px", color: "#64748b", cursor: "pointer", transition: "all .15s" }}>{ex}</button>
                  ))}
                </div>

                <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="用你自己的话说说就行，不用写得正式…" autoFocus
                  style={{ width: "100%", minHeight: 116, border: "1px solid #e2e8f0", borderRadius: 12, padding: 14, fontSize: 14, lineHeight: 1.6, color: "#1e293b", resize: "vertical" }} />

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 18 }}>
                  <button className="gbtn" onClick={next} style={{ ...ghostBtn, color: "#94a3b8", border: "none", padding: "8px 4px" }}><SkipForward size={14} /> 这条跳过</button>
                  <button className="pbtn" onClick={() => answer.trim() && setPhase("star")} disabled={!answer.trim()}
                    style={{ ...primaryBtn, opacity: answer.trim() ? 1 : 0.45, cursor: answer.trim() ? "pointer" : "not-allowed", boxShadow: answer.trim() ? "0 2px 8px rgba(79,70,229,.25)" : "none" }}>
                    <Sparkles size={15} /> 转成简历语言
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 12.5, color: "#94a3b8", marginBottom: 12 }}>AI 把你的回答转成了简历 bullet：</div>
                {/* STAR 结果（黄色=推断，左侧色条，和工作台一致）*/}
                <div className="card" style={{ padding: 18, borderLeft: "3px solid #d97706" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "#fffbeb", border: "1px solid #fde68a", padding: "3px 9px", borderRadius: 99 }}>
                      <CircleHelp size={13} color="#d97706" /><span style={{ fontSize: 11.5, fontWeight: 600, color: "#b45309" }}>推断信息</span>
                    </span>
                    <span style={{ fontSize: 11.5, color: "#94a3b8" }}>基于你的描述整理，请核对</span>
                  </div>
                  <div style={{ fontSize: 14.5, lineHeight: 1.7, color: "#1e293b" }}>{STAR_RESULT.bullet}</div>
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #f1f5f9", fontSize: 12.5, color: "#64748b" }}>
                    <b style={{ fontWeight: 600, color: "#475569" }}>建议补充 </b>{STAR_RESULT.missing.join("、")}
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 18 }}>
                  <button className="gbtn" onClick={() => setPhase("ask")} style={{ ...ghostBtn, color: "#64748b" }}><ChevronLeft size={14} /> 改改回答</button>
                  <button className="pbtn" onClick={accept} style={{ ...primaryBtn, boxShadow: "0 2px 8px rgba(79,70,229,.25)" }}>
                    {isLast ? <><CheckCircle2 size={15} /> 存入母版，开始编译</> : <><Check size={15} /> 存入母版，下一题</>}
                  </button>
                </div>

                {isLast && (
                  <div style={{ marginTop: 20, textAlign: "center", fontSize: 12.5, color: "#94a3b8" }}>
                    这是最后一题 · 答完将用收集的 {collected + 1} 段经历生成母版并开始编译
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const primaryBtn = { display: "flex", alignItems: "center", gap: 6, background: "linear-gradient(135deg,#6366f1,#4f46e5)", color: "#fff", border: "none", borderRadius: 10, padding: "11px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer" };
const ghostBtn = { display: "flex", alignItems: "center", gap: 5, background: "transparent", border: "1px solid #e2e8f0", borderRadius: 10, padding: "9px 14px", fontSize: 13, color: "#475569", cursor: "pointer" };
