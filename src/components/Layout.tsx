// ============================================================================
// 公共布局（Layout）
// ----------------------------------------------------------------------------
// 顶部导航 + 内容区（<Outlet/>）。所有页面共用，保证导航与外壳一致。
// 视觉沿用 slate/indigo 基调，后续 Phase 可在此挂全局状态/语言切换等。
// ============================================================================

import { NavLink, Outlet } from "react-router-dom";
import { FileText, Layers, Sparkles } from "lucide-react";

const NAV_ITEMS = [
  { to: "/", label: "首页", icon: Sparkles, end: true },
  { to: "/master", label: "我的母版", icon: FileText, end: false },
  { to: "/versions", label: "子版库", icon: Layers, end: false },
];

export default function Layout() {
  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 selection:bg-indigo-100 selection:text-indigo-900">
      <header className="sticky top-0 z-50 border-b border-slate-100 bg-white/80 backdrop-blur-xl">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <NavLink to="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900 text-white">
              <Sparkles size={16} />
            </div>
            <span className="text-sm font-black uppercase tracking-[0.2em] text-slate-900">
              Resume Compiler
            </span>
          </NavLink>

          <nav className="flex items-center gap-1">
            {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold uppercase tracking-wider transition-all ${
                    isActive
                      ? "bg-indigo-50 text-indigo-600"
                      : "text-slate-400 hover:bg-slate-50 hover:text-slate-700"
                  }`
                }
              >
                <Icon size={14} />
                <span className="hidden sm:inline">{label}</span>
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="container mx-auto px-4 py-10">
        <Outlet />
      </main>
    </div>
  );
}
