// ============================================================================
// 自绘表单控件（CheckBox / Select）
// ----------------------------------------------------------------------------
// 原生 <input type=checkbox> 与 <select> 的系统外观是最经典的"半成品/廉价"信号。
// 这里只换皮、不换行为：底层仍是原生控件，完整保留点击 / 键盘 / label 关联 / onChange
// 语义，仅去掉系统外观并自绘对勾与下拉箭头，使其与设计语言（indigo 主色、灰阶分层）一致。
// ============================================================================

import { useState, type ChangeEvent, type CSSProperties, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";

/**
 * 自绘勾选框：方框 + 对勾，选中态填充 indigo。
 * 底层是一个透明覆盖在视觉方框之上的原生 <input type=checkbox>——
 * 点击、空格键切换、focus、外层 <label> 关联、onChange(e) 全部原样保留。
 */
export function CheckBox({
  checked,
  onChange,
  disabled = false,
  size = 16,
}: {
  checked: boolean;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  size?: number;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-flex", width: size, height: size, flexShrink: 0 }}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", margin: 0, opacity: 0, cursor: disabled ? "default" : "pointer" }}
      />
      <span
        aria-hidden
        style={{
          width: size, height: size, borderRadius: 5, boxSizing: "border-box",
          border: `1.5px solid ${checked ? "#4f46e5" : "#cbd5e1"}`,
          background: checked ? "#4f46e5" : "#fff",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "background-color .15s, border-color .15s, box-shadow .15s",
          boxShadow: focused ? "0 0 0 3px rgba(79,70,229,.25)" : "none",
          opacity: disabled ? 0.55 : 1,
        }}
      >
        {checked && <Check size={size - 5} color="#fff" strokeWidth={3} />}
      </span>
    </span>
  );
}

/**
 * 自绘下拉：保留原生 <select>（键盘、原生选项面板、onChange 全保留），
 * 仅 appearance:none 去掉系统箭头 + 自绘 ChevronDown。页面样式经 style 传入，
 * 右内边距在最后强制留出箭头位，避免被页面 padding 覆盖。
 */
export function Select({
  value,
  onChange,
  children,
  style,
  disabled = false,
}: {
  value: string;
  onChange: (e: ChangeEvent<HTMLSelectElement>) => void;
  children: ReactNode;
  style?: CSSProperties;
  disabled?: boolean;
}) {
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <select
        value={value}
        onChange={onChange}
        disabled={disabled}
        style={{
          appearance: "none", WebkitAppearance: "none", MozAppearance: "none",
          outline: "none", cursor: disabled ? "default" : "pointer",
          ...style,
          paddingRight: 28,
        }}
      >
        {children}
      </select>
      <ChevronDown size={15} color="#94a3b8" style={{ position: "absolute", right: 9, pointerEvents: "none" }} />
    </span>
  );
}
