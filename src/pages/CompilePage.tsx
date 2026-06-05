// ============================================================================
// 编译流程页（Phase 5）—— 跑编译管线 + 加载动画，完成后跳工作台
// ----------------------------------------------------------------------------
// Upload 页 A/B 类点击"开始编译"带着 {company, position, jd} 跳到这里。
// 母版在上传时已写入 storage，这里从 storage 取 master，与 JD 一起跑 runCompile，
// 生成 CompiledVersion 草稿写入 storage，再跳 /workbench/:versionId。
//
// 缺母版或缺 JD（直接刷到本页）→ 回 /upload。
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import CompileLoading from "../components/CompileLoading";
import { addCompiledVersion, loadStorage } from "../lib/storage";
import { runCompile, type CompileStage } from "../lib/compile";
import type { JobDescription } from "../types";

// 分阶段加载文案：编译要打 5+ 次 Gemini、十几秒，期间用阶段文案告诉用户"跑到哪了"，
// 别让人对着不动的画面以为挂了。文案随 runCompile 的 onProgress 推进切换。
const STAGE_COPY: Record<CompileStage, { message: string; subMessage: string }> = {
  analyzing: { message: "正在解析 JD、改写经历…", subMessage: "评估相关性 · 改写润色 · 提取要求" },
  matching: { message: "正在做匹配分析…", subMessage: "建立 JD 要求与你经历的对应" },
  strategizing: { message: "正在生成投递建议…", subMessage: "为未满足的要求补面试策略" },
};

export default function CompilePage() {
  const navigate = useNavigate();
  const state = useLocation().state as
    | { company?: string; position?: string; jd?: string }
    | null;
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<CompileStage>("analyzing");
  const running = useRef(false); // 防 StrictMode / 重渲染 / 重试并发重复编译

  const run = useCallback(() => {
    const master = loadStorage().master;
    if (!master || !state?.company?.trim() || !state?.position?.trim() || !state?.jd?.trim()) {
      navigate("/upload", { replace: true });
      return;
    }
    if (running.current) return;
    running.current = true;
    setError(null);
    setStage("analyzing");

    const jd: JobDescription = {
      company: state.company.trim(),
      position: state.position.trim(),
      rawText: state.jd.trim(),
    };

    runCompile(master, jd, setStage)
      .then((version) => {
        addCompiledVersion(version);
        navigate(`/workbench/${version.id}`, { replace: true });
      })
      .catch((e) => {
        // 人话提示：429/超时/网络/解析/zod 校验失败统一兜底，不暴露技术栈、不白屏卡死
        console.error("[Compile] pipeline failed", e);
        setError("编译没能完成，可能是 AI 繁忙，请稍后重试。");
      })
      .finally(() => {
        running.current = false;
      });
  }, [state, navigate]);

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <div className="mx-auto max-w-xl py-24 text-center">
        <h1 className="mb-2 text-xl font-bold text-slate-900">编译未完成</h1>
        <p className="mb-6 text-sm font-medium text-slate-400">{error}</p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={run}
            className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
          >
            重试编译
          </button>
          <button
            onClick={() => navigate("/upload")}
            className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            返回上传页
          </button>
        </div>
      </div>
    );
  }

  return (
    <CompileLoading
      message={STAGE_COPY[stage].message}
      subMessage={STAGE_COPY[stage].subMessage}
    />
  );
}
