// ============================================================================
// useIsMobile —— 窄屏/移动端判据（纯前端，无依赖）
// ----------------------------------------------------------------------------
// 产品是桌面三栏工作台，手机/窄屏上会挤成一团。用 viewport 宽度断点（默认 768px）
// 作判据：它直接回答"三栏布局会不会崩"，在 DevTools 响应式视图里也能稳定触发，
// 且让平板横屏（≥768）正常通过——契合兜底页"请用电脑/平板横屏访问"的引导。
// 刻意不做 UA 嗅探：宽度是更可预测、更贴合"布局会否崩坏"的信号。
// ============================================================================

import { useEffect, useState } from "react";

/** 三栏工作台在此宽度以下会挤坏 → 触发移动端兜底页。 */
export const MOBILE_BREAKPOINT = 768;

/** 返回当前是否为窄屏（< breakpoint）。监听 resize，桌面缩窗/旋屏都会实时更新。 */
export function useIsMobile(breakpoint = MOBILE_BREAKPOINT): boolean {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth < breakpoint,
  );

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < breakpoint);
    onResize(); // 挂载即对齐一次（避免首帧用初值后再跳）
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [breakpoint]);

  return isMobile;
}
