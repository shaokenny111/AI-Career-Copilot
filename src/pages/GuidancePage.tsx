// ============================================================================
// 应届生引导页（占位）—— 后续 Phase 接入 Prompt #5 提问 + #6 STAR 转换
// ----------------------------------------------------------------------------
// Phase 3 仅留好跳转入口：Upload 页识别为 C 类（半成品/应届）时点击"进入引导"
// 会带着 {company, position, jd} 跳到这里，逐步补全母版。
// ============================================================================

import { useLocation, useNavigate } from "react-router-dom";

export default function GuidancePage() {
  const navigate = useNavigate();
  const state = useLocation().state as
    | { company?: string; position?: string; jd?: string }
    | null;

  return (
    <div className="mx-auto max-w-3xl py-16">
      <h1 className="mb-2 text-2xl font-black tracking-tight text-slate-900">
        应届生引导（后续 Phase 接入）
      </h1>
      <p className="text-sm font-medium text-slate-400">
        将根据 <b>{state?.company || "—"} · {state?.position || "—"}</b> 的 JD
        向你提问，帮你一步步把经历补全成母版。提问（#5）与 STAR 转换（#6）会在后续 Phase 接入。
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
