import type { Stats } from "../types";

export function StatsBar({ stats }: { stats: Stats | null }) {
  if (!stats) {
    return <div className="statsbar">加载概览中…</div>;
  }
  const b = stats.bandgapBuckets;
  const segs: [string, number, string][] = [
    ["金属", b.metal, "#5b8cff"],
    ["半金属 <0.5", b.semiMetal, "#22d3ee"],
    ["窄禁带 0.5–1.5", b.narrow, "#34d399"],
    ["半导体 1.5–3", b.semiconductor, "#a3e635"],
    ["绝缘体 3–6", b.insulator, "#fbbf24"],
    ["宽禁带 ≥6", b.wide, "#f87171"],
    ["未知", b.unknown, "#3a4356"],
  ];
  return (
    <div className="statsbar">
      <div className="stats-total">
        <span className="num">{stats.total.toLocaleString()}</span>
        <span className="lbl"> 条稳定材料</span>
      </div>
      <div className="stats-band">
        {segs.map(([label, v, color]) =>
          v > 0 ? (
            <div
              key={label}
              className="seg"
              style={{ flex: v, background: color }}
              title={`${label}: ${v.toLocaleString()}`}
            >
              {v > 15000 ? label : ""}
            </div>
          ) : null,
        )}
      </div>
    </div>
  );
}
