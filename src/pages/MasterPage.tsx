// 母版页（占位）—— 后续 Phase 填充：母版 segments 的查看/编辑/补充
export default function MasterPage() {
  return (
    <div className="mx-auto max-w-3xl py-16">
      <h1 className="mb-2 text-2xl font-black tracking-tight text-slate-900">
        我的母版
      </h1>
      <p className="text-sm font-medium text-slate-400">
        母版是你所有经历的完整集合，永远保留。此页将在后续 Phase 接入 segments 的查看与编辑。
      </p>
    </div>
  );
}
