// ============================================================================
// AppStorage 持久化层
// ----------------------------------------------------------------------------
// - 唯一存储介质：localStorage（单 key，整份 JSON）
// - 唯一类型来源：types.ts 的 AppStorage —— 本文件不再重复定义结构
// - schemaVersion：每次 AppStorage 结构变化时，CURRENT_SCHEMA_VERSION + 1，
//   并在 MIGRATIONS 注册"从旧版本到下一版本"的转换函数
// ============================================================================

import type { AppStorage, CompiledVersion } from "../types";

const STORAGE_KEY = "ai_resume_compiler_v2";

/** 当前 AppStorage 的 schema 版本。结构变化时递增并补一条 MIGRATIONS。
 *  v2：CompiledVersion 引入 requirementMatches、bullet.id、jobDescription.requirements
 *  （确定性匹配度重构）。开发期旧数据均为测试数据，不写迁移函数 → 自动重置为默认值，
 *  保持 scoring 单路径干净；用户重新编译即可。 */
export const CURRENT_SCHEMA_VERSION = 2;

/**
 * 升级钩子：第 N 项负责把"version N 的数据"转成"version N+1 的数据"，
 * 转换函数必须返回带正确 schemaVersion 的新对象。
 *
 * 约束：
 * - 不要修改已发布的迁移函数（否则老用户数据会被二次破坏）
 * - 新增结构时只新增一条，不修改老条
 */
const MIGRATIONS: Record<number, (data: any) => any> = {
  // 示例（未来需要时启用）：
  // 1: (data) => ({ ...data, schemaVersion: 2, newField: defaultValueForNewField }),
};

function getDefaultStorage(): AppStorage {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    master: null,
    compiledVersions: [],
    onboarding: {
      onboardedV1: false,
    },
    preferences: {
      uiLanguage: "zh",
    },
  };
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

// ---------- 响应式订阅（useSyncExternalStore 用；React 内置，非新状态库）----------
// 缓存快照 + 订阅者集合：saveStorage 成功后刷新快照并通知，跨页实时反映。
// getStorageSnapshot 在两次变更之间返回同一引用，避免 useSyncExternalStore 死循环。
let cachedSnapshot: AppStorage | null = null;
const subscribers = new Set<() => void>();

/** 订阅存储变更（返回取消订阅函数）。 */
export function subscribeStorage(cb: () => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

/** 当前存储快照（引用稳定，仅在 saveStorage 后变化）。 */
export function getStorageSnapshot(): AppStorage {
  if (!cachedSnapshot) cachedSnapshot = loadStorage();
  return cachedSnapshot;
}

/**
 * 从任意旧版本依次升级到 CURRENT_SCHEMA_VERSION。
 * 路径中缺迁移函数视为不可恢复 —— 直接回退默认值，避免把脏数据塞进 UI。
 */
function migrate(raw: any): AppStorage {
  let current = raw;
  let version =
    typeof current?.schemaVersion === "number" ? current.schemaVersion : 0;

  while (version < CURRENT_SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) {
      console.warn(
        `[storage] No migration registered from schema ${version} → ${CURRENT_SCHEMA_VERSION}, resetting to defaults`,
      );
      return getDefaultStorage();
    }
    current = step(current);
    if (typeof current?.schemaVersion !== "number" || current.schemaVersion <= version) {
      console.warn(
        `[storage] Migration ${version} did not advance schemaVersion, resetting`,
      );
      return getDefaultStorage();
    }
    version = current.schemaVersion;
  }

  return current as AppStorage;
}

/**
 * 读取整份 AppStorage。
 * - 无数据 → 返回默认值（不写入）
 * - 版本已是最新 → 直接返回
 * - 版本落后 → 跑迁移，并立刻把迁移后的数据回写
 * - JSON 损坏 → 回退默认值
 */
export function loadStorage(): AppStorage {
  if (!isBrowser()) return getDefaultStorage();

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return getDefaultStorage();

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error("[storage] Failed to parse stored JSON, resetting", err);
    return getDefaultStorage();
  }

  if (parsed?.schemaVersion === CURRENT_SCHEMA_VERSION) {
    return parsed as AppStorage;
  }

  const migrated = migrate(parsed);
  saveStorage(migrated);
  return migrated;
}

/** 写回整份 AppStorage。保存前强制对齐 schemaVersion，避免上层忘了带。 */
export function saveStorage(data: AppStorage): void {
  if (!isBrowser()) return;
  const payload: AppStorage = {
    ...data,
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    // 刷新快照（新引用）并通知订阅者 → 已挂载组件实时重渲染
    cachedSnapshot = payload;
    subscribers.forEach((cb) => cb());
  } catch (err) {
    console.error("[storage] Failed to save", err);
  }
}

/** 清空并重置为默认值。调试/"重新开始"按钮使用。 */
export function resetStorage(): AppStorage {
  const fresh = getDefaultStorage();
  saveStorage(fresh);
  return fresh;
}

/** 追加一个编译出的子版到 compiledVersions（编译完成后调用）。 */
export function addCompiledVersion(version: CompiledVersion): void {
  const store = loadStorage();
  saveStorage({
    ...store,
    compiledVersions: [...store.compiledVersions, version],
  });
}

/** 按 id 取单个子版；不存在返回 null（工作台 / 子版库点击进入时用）。 */
export function getCompiledVersion(id: string): CompiledVersion | null {
  return loadStorage().compiledVersions.find((v) => v.id === id) ?? null;
}

/** 原位更新一个子版（工作台采纳/编辑后回写）。id 不存在则忽略。 */
export function updateCompiledVersion(version: CompiledVersion): void {
  const store = loadStorage();
  saveStorage({
    ...store,
    compiledVersions: store.compiledVersions.map((v) =>
      v.id === version.id ? version : v,
    ),
  });
}

/**
 * 设置某子版的投递标记（7D）。applied=true 记录当前时间为 appliedAt，false 清空。
 * 不改 updatedAt（投递是元数据标记，不应改变子版库的"最后更新"排序）。
 * applicationMark 字段自始就在 schema 内，本操作不触发 schema 升级。
 */
export function setApplicationMark(versionId: string, applied: boolean): void {
  const store = loadStorage();
  saveStorage({
    ...store,
    compiledVersions: store.compiledVersions.map((v) =>
      v.id === versionId
        ? {
            ...v,
            applicationMark: applied
              ? { applied: true, appliedAt: new Date().toISOString() }
              : { applied: false },
          }
        : v,
    ),
  });
}
