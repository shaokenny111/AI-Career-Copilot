// ============================================================================
// 公共布局（Layout）
// ----------------------------------------------------------------------------
// 统一 Header（logo 可点击回首页 + 中/EN 全局切换）+ 顶部径向光晕 + 内容区
// （<Outlet/>）。视觉对齐 _refs/ui/my_resume_final_v3.jsx。母版/子版库不是独立
// 导航项，而是首页（hub）内的分区，故 Header 不放主导航。
// ============================================================================

import { Outlet, useNavigate } from "react-router-dom";
import { FileText } from "lucide-react";

export default function Layout() {
  const navigate = useNavigate();

  return (
    <div style={{ position: "relative", minHeight: "100vh", background: "#f8fafc", color: "#1e293b" }}>
      {/* 顶部径向光晕 */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 300,
          background:
            "radial-gradient(55% 55% at 50% 0%, rgba(99,102,241,.08), transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <header
        style={{
          height: 60,
          borderBottom: "1px solid #e2e8f0",
          background: "rgba(255,255,255,.85)",
          backdropFilter: "blur(8px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 28px",
          position: "relative",
          zIndex: 2,
        }}
      >
        <div
          title="首页"
          onClick={() => navigate("/")}
          style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
        >
          <div
            style={{
              width: 30,
              height: 30,
              background: "linear-gradient(135deg,#6366f1,#4f46e5)",
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 2px 8px rgba(79,70,229,.3)",
            }}
          >
            <FileText size={16} color="#fff" />
          </div>
          <span className="serif" style={{ fontWeight: 600, fontSize: 17 }}>
            AI Resume Compiler
          </span>
        </div>
      </header>

      <main style={{ position: "relative", zIndex: 1 }}>
        <Outlet />
      </main>
    </div>
  );
}
