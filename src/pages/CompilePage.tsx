// ============================================================================
// 编译流程页（占位）—— Phase 5 接入真实编译管线（相关性评估 / 改写标注 / 工作台）
// ----------------------------------------------------------------------------
// Phase 3 仅留好跳转入口：Upload 页 A/B 类点击"开始编译"会带着 {company,
// position, jd} 跳到这里。母版已在上传时写入 storage，编译时从 storage 取。
// ============================================================================

import { useLocation, useNavigate } from "react-router-dom";

export default function CompilePage() {
  const navigate = useNavigate();
  const state = useLocation().state as
    | { company?: string; position?: string; jd?: string }
    | null;

  return (
    <div className="mx-auto max-w-3xl py-16">
      <h1 className="mb-2 text-2xl font-black tracking-tight text-slate-900">
        编译流程（Phase 5 接入）
      </h1>
      <p className="text-sm font-medium text-slate-400">
        将针对 <b>{state?.company || "—"} · {state?.position || "—"}</b> 编译投递版本。
        相关性评估、改写标注与工作台会在 Phase 5/6 接入。
      </p>
      <button
        onClick={() => navigate("/")}
        className="mt-6 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600"
      >
        返回首页
      </button>
    </div>
  );
}
