// 子版库页（占位）—— 后续 Phase 填充：针对各 JD 编译出的子版列表与匹配度
export default function VersionsPage() {
  return (
    <div className="mx-auto max-w-3xl py-16">
      <h1 className="mb-2 text-2xl font-black tracking-tight text-slate-900">
        子版库
      </h1>
      <p className="text-sm font-medium text-slate-400">
        每次针对一个 JD 编译出的投递版本会汇集在这里，按匹配度区分。此页将在后续 Phase 接入。
      </p>
    </div>
  );
}
