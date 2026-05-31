// 首页（占位）—— 后续 Phase 填充：上传简历 → 类型识别 → 进入对应流程
import { Link } from "react-router-dom";

export default function HomePage() {
  return (
    <div className="mx-auto max-w-3xl py-16 text-center">
      <h1 className="mb-4 text-4xl font-black tracking-tighter text-slate-900 md:text-5xl">
        把一份母版，
        <span className="bg-gradient-to-r from-indigo-600 to-indigo-400 bg-clip-text text-transparent">
          编译成每一个岗位的最优投递版
        </span>
      </h1>
      <p className="mb-10 text-sm font-medium leading-relaxed text-slate-400">
        Phase 1 路由壳已就位。上传解析、类型识别、JD 编译与改写工作台将在后续 Phase 接入。
      </p>
      <div className="flex items-center justify-center gap-3">
        <Link
          to="/master"
          className="rounded-2xl bg-slate-900 px-6 py-3 text-sm font-black uppercase tracking-wider text-white transition-all hover:bg-indigo-600"
        >
          管理我的母版
        </Link>
        <Link
          to="/versions"
          className="rounded-2xl border-2 border-slate-100 bg-white px-6 py-3 text-sm font-black uppercase tracking-wider text-slate-600 transition-all hover:border-slate-200"
        >
          查看子版库
        </Link>
      </div>
    </div>
  );
}
