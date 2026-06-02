// ============================================================================
// useAppStorage —— 存储的响应式读取（React 内置 useSyncExternalStore，非新状态库）
// ----------------------------------------------------------------------------
// 订阅 storage.ts 的发布订阅层：任何 saveStorage（采纳/编辑/投递标记…）后，所有用本
// hook 的已挂载组件实时重渲染。getStorageSnapshot 引用稳定，无死循环。
// ============================================================================

import { useSyncExternalStore } from "react";
import { getStorageSnapshot, subscribeStorage } from "./storage";
import type { AppStorage } from "../types";

/** 响应式读取整份 AppStorage（变更实时反映）。 */
export function useAppStorage(): AppStorage {
  return useSyncExternalStore(subscribeStorage, getStorageSnapshot, getStorageSnapshot);
}
