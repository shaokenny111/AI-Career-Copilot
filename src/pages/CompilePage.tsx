// ============================================================================
// 编译流程页（Phase 5）—— 跑编译管线 + 加载动画，完成后跳工作台
// ----------------------------------------------------------------------------
// Upload 页 A/B 类点击"开始编译"带着 {company, position, jd} 跳到这里。
// 母版在上传时已写入 storage，这里从 storage 取 master，与 JD 一起跑 runCompile，
// 生成 CompiledVersion 草稿写入 storage，再跳 /workbench/:versionId。
//
// 缺母版或缺 JD（直接刷到本页）→ 回 /upload。
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import CompileLoading from "../components/CompileLoading";
import { addCompiledVersion, loadStorage } from "../lib/storage";
import { runCompile } from "../lib/compile";
import type { JobDescription } from "../types";

export default function CompilePage() {
  const navigate = useNavigate();
  const state = useLocation().state as
    | { company?: string; position?: string; jd?: string }
    | null;
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false); // 防 StrictMode / 重渲染重复编译

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const master = loadStorage().master;
    if (!master || !state?.company?.trim() || !state?.position?.trim() || !state?.jd?.trim()) {
      navigate("/upload", { replace: true });
      return;
    }

    const jd: JobDescription = {
      company: state.company.trim(),
      position: state.position.trim(),
      rawText: state.jd.trim(),
    };

    runCompile(master, jd)
      .then((version) => {
        addCompiledVersion(version);
        navigate(`/workbench/${version.id}`, { replace: true });
      })
      .catch((e) => {
        console.error("[Compile] pipeline failed", e);
        setError("编译失败了，请返回重试。");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <div className="mx-auto max-w-xl py-24 text-center">
        <h1 className="mb-2 text-xl font-bold text-slate-900">编译未完成</h1>
        <p className="mb-6 text-sm font-medium text-slate-400">{error}</p>
        <button
          onClick={() => navigate("/upload")}
          className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white"
        >
          返回上传页
        </button>
      </div>
    );
  }

  return (
    <CompileLoading
      message="正在编译投递版…"
      subMessage="评估相关性 · 改写润色 · 差距分析"
    />
  );
}
