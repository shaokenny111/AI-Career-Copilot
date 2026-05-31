// ============================================================================
// 应用路由壳（Router Shell）
// ----------------------------------------------------------------------------
// Phase 1：搭起 react-router 骨架 + 公共 Layout。各页面目前是占位，后续 Phase
// 逐步填充真实内容（母版管理、JD 编译、工作台、子版库等）。
// ============================================================================

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import HomePage from "./pages/HomePage";
import MasterPage from "./pages/MasterPage";
import VersionsPage from "./pages/VersionsPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* 公共 Layout 作为布局路由，所有页面共用顶部导航 */}
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="master" element={<MasterPage />} />
          <Route path="versions" element={<VersionsPage />} />
          {/* 未知路径回首页 */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
