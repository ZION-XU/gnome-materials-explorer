import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  exportCif as exportCifFile,
  exportPoscar,
  exportQeInput,
  getStructure,
} from "../api";
import { assessBatteryCandidate } from "../battery";
import type { ExportedFile, MaterialRow, Structure } from "../types";

const CrystalViewer = lazy(() =>
  import("./CrystalViewer").then((module) => ({ default: module.CrystalViewer })),
);

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
  const [structure, setStructure] = useState<Structure | null>(null);
  const [structureLoading, setStructureLoading] = useState(false);
  const [structureError, setStructureError] = useState<string | null>(null);
  const [viewerRequested, setViewerRequested] = useState(false);
  const [structureExporting, setStructureExporting] = useState<string | null>(null);
  const [structureExportMessage, setStructureExportMessage] = useState<string | null>(null);
  const currentMaterialIdRef = useRef<string | null>(null);
  const requestSeqRef = useRef(0);
  const battery = m ? assessBatteryCandidate(m) : null;

  useEffect(() => {
    currentMaterialIdRef.current = m?.materialId ?? null;
    requestSeqRef.current += 1;
    setStructure(null);
    setStructureError(null);
    setStructureLoading(false);
    setViewerRequested(false);
    setStructureExporting(null);
    setStructureExportMessage(null);
  }, [m?.materialId]);

  const loadStructure = useCallback(async () => {
    const materialId = m?.materialId;
    if (!materialId || structureLoading) return;
    const seq = ++requestSeqRef.current;
    setViewerRequested(true);
    setStructureLoading(true);
    setStructureError(null);
    try {
      const next = await getStructure(materialId);
      if (requestSeqRef.current === seq && currentMaterialIdRef.current === materialId) {
        setStructure(next);
      }
    } catch (e) {
      if (requestSeqRef.current === seq && currentMaterialIdRef.current === materialId) {
        setStructure(null);
        setStructureError(String(e));
      }
    } finally {
      if (requestSeqRef.current === seq && currentMaterialIdRef.current === materialId) {
        setStructureLoading(false);
      }
    }
  }, [m?.materialId, structureLoading]);

  const exportStructureFile = useCallback(async (
    kind: "cif" | "poscar" | "qe",
    exporter: (materialId: string) => Promise<ExportedFile>,
  ) => {
    const materialId = m?.materialId;
    if (!materialId || structureExporting) return;
    const label = kind === "cif" ? "CIF" : kind === "poscar" ? "POSCAR" : "Quantum ESPRESSO 输入";
    setStructureExporting(kind);
    setStructureExportMessage(`正在导出 ${label}…`);
    try {
      const file = await exporter(materialId);
      if (currentMaterialIdRef.current === materialId) {
        setStructureExportMessage(`已导出：${file.path}`);
      }
    } catch (e) {
      if (currentMaterialIdRef.current === materialId) {
        setStructureExportMessage(`导出失败：${String(e)}`);
      }
    } finally {
      if (currentMaterialIdRef.current === materialId) {
        setStructureExporting(null);
      }
    }
  }, [m?.materialId, structureExporting]);

  if (!m) {
    return <div className="detail empty">点击结果行查看材料详情</div>;
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

      <section className="structure-card">
        <div className="structure-title">
          <span>3D 晶体结构</span>
          <div className="structure-actions">
            {structureError && (
              <button onClick={loadStructure} disabled={structureLoading}>重试</button>
            )}
            <button
              onClick={() => exportStructureFile("cif", exportCifFile)}
              disabled={structureExporting !== null}
            >
              {structureExporting === "cif" ? "导出中…" : "导出 CIF"}
            </button>
            <button
              onClick={() => exportStructureFile("poscar", exportPoscar)}
              disabled={structureExporting !== null}
            >
              {structureExporting === "poscar" ? "导出中…" : "导出 POSCAR"}
            </button>
            <button
              onClick={() => exportStructureFile("qe", exportQeInput)}
              disabled={structureExporting !== null}
            >
              {structureExporting === "qe" ? "导出中…" : "导出 QE"}
            </button>
          </div>
        </div>
        {structureExportMessage && <div className="structure-status">{structureExportMessage}</div>}
        {viewerRequested ? (
          <Suspense fallback={<div className="viewer-loading">加载 3D 组件中…</div>}>
            <CrystalViewer
              materialId={m.materialId}
              structure={structure}
              loading={structureLoading}
              error={structureError}
              onLoad={loadStructure}
            />
          </Suspense>
        ) : (
          <div className="viewer-prompt">
            <button className="load-btn" onClick={loadStructure}>
              加载 3D 结构
            </button>
            <span>从本地 by_id.zip 读取 CIF，点击后再加载 Three.js。</span>
          </div>
        )}
        {structure && !structure.symmetryApplied && (
          <div className="structure-note">
            当前显示 CIF 原始原子坐标，未做空间群对称性展开；用于候选材料快速预览。
          </div>
        )}
      </section>

      {battery && battery.families.length > 0 && (
        <section className="battery-card">
          <div className="battery-head">
            <span>固态电池候选判断</span>
            <span className={`score-pill score-${battery.score}`}>{battery.scoreLabel}</span>
          </div>
          <div className="battery-families">
            {battery.families.map((family) => (
              <span key={family.id} className="battery-tag" title={family.desc}>
                {family.name}
              </span>
            ))}
          </div>
          <ul className="battery-reasons">
            {battery.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </section>
      )}

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
