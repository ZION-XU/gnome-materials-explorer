import type { ReactNode } from "react";
import type { MaterialRow } from "../types";

interface Props {
  m: MaterialRow | null;
  onClose: () => void;
  onExport: (m: MaterialRow, fmt: "csv" | "json") => void;
}

function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="drow">
      <span className="dk">{k}</span>
      <span className="dv">{v}</span>
    </div>
  );
}

const bandgapLabel = (m: MaterialRow) => {
  if (m.isMetal === true) return "0 (金属)";
  if (m.bandgap == null) return "未知";
  return `${m.bandgap.toFixed(4)} eV`;
};

export function DetailPanel({ m, onClose, onExport }: Props) {
  if (!m) {
    return (
      <div className="detail empty">点击结果行查看材料详情</div>
    );
  }
  return (
    <div className="detail">
      <div className="detail-head">
        <h3 className="mono">{m.reducedFormula}</h3>
        <div className="detail-actions">
          <button onClick={() => onExport(m, "csv")}>导出 CSV</button>
          <button onClick={() => onExport(m, "json")}>导出 JSON</button>
          <button className="close" onClick={onClose}>✕</button>
        </div>
      </div>
      <div className="drows">
        <Row k="Material ID" v={<span className="mono">{m.materialId}</span>} />
        <Row k="组成" v={m.composition} />
        <Row k="元素" v={m.elements.join(" · ")} />
        <Row k="带隙" v={bandgapLabel(m)} />
        <Row
          k="形成能 (eV/atom)"
          v={m.formationEnergyPerAtom == null ? "—" : m.formationEnergyPerAtom.toFixed(4)}
        />
        <Row
          k="分解能 (eV/atom)"
          v={m.decompositionEnergyPerAtom == null ? "—" : m.decompositionEnergyPerAtom.toFixed(4)}
        />
        <Row k="密度 (g/cm³)" v={m.density == null ? "—" : m.density.toFixed(3)} />
        <Row k="体积 (Å³)" v={m.volume == null ? "—" : m.volume.toFixed(2)} />
        <Row k="原子数" v={m.nSites ?? "—"} />
        <Row k="晶系" v={m.crystalSystem ?? "—"} />
        <Row k="空间群" v={m.spaceGroup ? `${m.spaceGroup} (${m.spaceGroupNumber ?? "?"})` : "—"} />
        <Row k="点群" v={m.pointGroup ?? "—"} />
        <Row k="维度" v={m.dimensionality ?? "—"} />
        <Row k="结构路径" v={<span className="mono small">{m.dataDirectory ?? "—"}</span>} />
      </div>
    </div>
  );
}
