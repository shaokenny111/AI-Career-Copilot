// ============================================================================
// MiniRing —— 子版卡上的四级匹配度圆环
// ----------------------------------------------------------------------------
// 端口自原设计稿的 MiniRing：渐变描边进度环 + 衬线分数。
// 颜色由调用方按 matchTier 传入，保证四级分色一致。
// ============================================================================

interface MiniRingProps {
  /** 0-100 的匹配度分数 */
  value: number;
  /** 主色（渐变终点 + 文字色） */
  color: string;
  /** 渐变起点浅色 */
  colorLight: string;
  size?: number;
  stroke?: number;
}

export default function MiniRing({
  value,
  color,
  colorLight,
  size = 64,
  stroke = 6,
}: MiniRingProps) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - value / 100);
  const gid = `mr-${value}-${color.replace("#", "")}`;

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <defs>
          <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={colorLight} />
            <stop offset="100%" stopColor={color} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${gid})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span className="serif" style={{ fontSize: 19, fontWeight: 600, color, lineHeight: 1 }}>
          {value}
        </span>
        <span style={{ fontSize: 8, color: "#94a3b8", marginTop: 1 }}>匹配</span>
      </div>
    </div>
  );
}
