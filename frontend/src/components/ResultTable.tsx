import type { MaterialRow } from "../types";
import { assessBatteryCandidate } from "../battery";

interface Props {
  rows: MaterialRow[];
  selectedId: string | null;
  onSelect: (m: MaterialRow) => void;
}

const fmt = (v: number | null, d = 3) => (v == null ? "—" : v.toFixed(d));

export function ResultTable({ rows, selectedId, onSelect }: Props) {
  if (rows.length === 0) {
    return <div className="rtable-empty">无结果 — 设置筛选条件后点击「查询」</div>;
  }
  return (
    <div className="rtable-wrap">
      <table className="rtable">
        <thead>
          <tr>
            <th>化学式</th>
            <th>元素</th>
            <th>带隙 (eV)</th>
            <th>类型</th>
            <th>分解能 (eV/atom)</th>
            <th>固态电池候选</th>
            <th>密度</th>
            <th>晶系</th>
            <th>维度</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => {
            const battery = assessBatteryCandidate(m);
            return (
              <tr
                key={m.materialId}
                className={m.materialId === selectedId ? "sel" : ""}
                onClick={() => onSelect(m)}
              >
                <td className="mono">{m.reducedFormula}</td>
                <td className="elems">{m.elements.join(" · ")}</td>
                <td>{m.isMetal === true ? "0 (金属)" : fmt(m.bandgap, 4)}</td>
                <td>
                  {m.isMetal === true ? "金属" : m.isMetal === false ? "非金属" : "—"}
                </td>
                <td>{fmt(m.decompositionEnergyPerAtom, 4)}</td>
                <td title={battery.reasons.join("；")}>
                  {battery.families.length > 0 ? (
                    <div className="battery-cell">
                      <span className={`score-pill score-${battery.score}`}>{battery.scoreLabel}</span>
                      <span>{battery.families.map((family) => family.shortName).join(" / ")}</span>
                    </div>
                  ) : (
                    "—"
                  )}
                </td>
                <td>{fmt(m.density, 2)}</td>
                <td>{m.crystalSystem ?? "—"}</td>
                <td>{m.dimensionality ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
