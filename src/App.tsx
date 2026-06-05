// ============================================================================
// 应用路由壳（Router Shell）
// ----------------------------------------------------------------------------
// Phase 1：搭起 react-router 骨架 + 公共 Layout。各页面目前是占位，后续 Phase
// 逐步填充真实内容（母版管理、JD 编译、工作台、子版库等）。
// ============================================================================

import { useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import MobileGate from "./components/MobileGate";
import { useIsMobile } from "./lib/useIsMobile";
import HomePage from "./pages/HomePage";
import MasterPage from "./pages/MasterPage";
import VersionsPage from "./pages/VersionsPage";
import UploadPage from "./pages/UploadPage";
import NewVersionPage from "./pages/NewVersionPage";
import CompilePage from "./pages/CompilePage";
import GuidancePage from "./pages/GuidancePage";
import WorkbenchPage from "./pages/WorkbenchPage";
import CompletePage from "./pages/CompletePage";

export default function App() {
  const isMobile = useIsMobile();
  const [continueOnMobile, setContinueOnMobile] = useState(false);

  // 窄屏兜底：拦在路由之前，绝不让会崩的桌面三栏布局在小屏挂载。
  // 不锁死——用户坚持可放行；放宽到桌面尺寸时自动恢复正常渲染。
  if (isMobile && !continueOnMobile) {
    return <MobileGate onContinue={() => setContinueOnMobile(true)} />;
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* 公共 Layout 作为布局路由，所有页面共用顶部导航 */}
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="upload" element={<UploadPage />} />
          <Route path="new-version" element={<NewVersionPage />} />
          <Route path="compile" element={<CompilePage />} />
          <Route path="workbench/:versionId" element={<WorkbenchPage />} />
          <Route path="complete/:versionId" element={<CompletePage />} />
          <Route path="guidance" element={<GuidancePage />} />
          <Route path="master" element={<MasterPage />} />
          <Route path="versions" element={<VersionsPage />} />
          {/* 未知路径回首页 */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
