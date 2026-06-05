// ============================================================================
// MobileGate —— 移动端/窄屏兜底引导页
// ----------------------------------------------------------------------------
// 面试官十有八九先用手机点开你发的链接；桌面三栏工作台在手机上会挤成一团乱。
// 检测到窄屏时（见 useIsMobile）由 App 用本页拦在前面，绝不渲染会崩的桌面布局，
// 而是显示这张干净、体面的"请用电脑访问"引导页——它可能是面试官看到的第一屏。
//
// 视觉对齐产品设计语言：Fraunces 标题（.serif）+ IBM Plex Sans 正文 + indigo 主色 +
// 顶部径向光晕，与 Layout 一致。不彻底锁死：底部留"仍要在手机上继续"的入口。
// ============================================================================

import type { CSSProperties } from "react";
import { FileText, Monitor, ArrowRight, Smartphone } from "lucide-react";

interface MobileGateProps {
  /** 用户坚持在手机继续 → 放行去渲染桌面布局（自负挤压风险）。 */
  onContinue: () => void;
}

export default function MobileGate({ onContinue }: MobileGateProps) {
  return (
    <div style={page}>
      {/* 顶部径向光晕（与 Layout 同款，保持品牌一致） */}
      <div style={glow} />

      <div style={inner}>
        {/* 品牌区 */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
          <div style={logoSquare}>
            <FileText size={26} color="#fff" />
          </div>
          <div className="serif" style={{ fontSize: 26, fontWeight: 600, color: "#1e293b" }}>
            AI Resume Compiler
          </div>
          <div style={{ fontSize: 13.5, color: "#94a3b8", lineHeight: 1.6, maxWidth: 300 }}>
            把你的简历针对目标岗位 JD 智能编译成投递版本的 AI 工作台
          </div>
        </div>

        {/* 引导卡 */}
        <div style={card}>
          <div style={monitorCircle}>
            <Monitor size={28} color="#4f46e5" />
          </div>
          <div className="serif" style={{ fontSize: 20, fontWeight: 600, color: "#1e293b", marginTop: 18 }}>
            请在电脑上打开
          </div>
          <div style={{ fontSize: 13.5, color: "#64748b", lineHeight: 1.7, marginTop: 10 }}>
            这是一个桌面三栏工作台，手机屏幕放不下完整的编译与对照视图。
            <br />
            为获得最佳体验，请用<b style={{ color: "#475569", fontWeight: 600 }}>电脑</b>或
            <b style={{ color: "#475569", fontWeight: 600 }}>平板横屏</b>访问。
          </div>

          {/* 复制链接小提示 */}
          <div style={tip}>
            <Smartphone size={14} color="#6366f1" style={{ flexShrink: 0, marginTop: 1 }} />
            <span>把当前链接复制到电脑浏览器打开即可，数据存在本地不会丢。</span>
          </div>
        </div>

        {/* 不锁死：仍要继续的低调入口 */}
        <button onClick={onContinue} style={continueBtn} className="mg-continue">
          仍要在手机上继续 <ArrowRight size={14} />
        </button>
      </div>

      <style>{`
        .mg-continue { transition: color .15s, border-color .15s; }
        .mg-continue:hover { color: #4f46e5; border-color: #c7d2fe; }
      `}</style>
    </div>
  );
}

const page: CSSProperties = {
  position: "relative",
  minHeight: "100vh",
  background: "#f8fafc",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "32px 22px",
};

const glow: CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  height: 320,
  background: "radial-gradient(60% 60% at 50% 0%, rgba(99,102,241,.10), transparent 70%)",
  pointerEvents: "none",
};

const inner: CSSProperties = {
  position: "relative",
  zIndex: 1,
  width: "100%",
  maxWidth: 400,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 28,
  textAlign: "center",
};

const logoSquare: CSSProperties = {
  width: 52,
  height: 52,
  background: "linear-gradient(135deg,#6366f1,#4f46e5)",
  borderRadius: 13,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  boxShadow: "0 6px 18px rgba(79,70,229,.32)",
};

const card: CSSProperties = {
  width: "100%",
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 18,
  boxShadow: "0 1px 2px -1px rgb(15 23 42/.08), 0 8px 24px -6px rgb(15 23 42/.10)",
  padding: "30px 24px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
};

const monitorCircle: CSSProperties = {
  width: 64,
  height: 64,
  borderRadius: 18,
  background: "#eef2ff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const tip: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "flex-start",
  textAlign: "left",
  marginTop: 20,
  fontSize: 12.5,
  color: "#6366f1",
  background: "#eef2ff",
  border: "1px solid #e0e7ff",
  borderRadius: 11,
  padding: "11px 13px",
  lineHeight: 1.55,
};

const continueBtn: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  background: "transparent",
  border: "1px solid #e2e8f0",
  borderRadius: 99,
  padding: "9px 18px",
  fontSize: 12.5,
  fontWeight: 500,
  color: "#94a3b8",
  cursor: "pointer",
};
