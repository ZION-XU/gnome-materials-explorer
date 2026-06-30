import { useEffect, useState } from "react";
import type { Filter, MaterialRow, Stats } from "./types";
import { emptyFilter } from "./types";
import { countMaterials, fetchStats, queryMaterials } from "./api";
import { FilterPanel } from "./components/FilterPanel";
import { ResultTable } from "./components/ResultTable";
import { DetailPanel } from "./components/DetailPanel";
import { StatsBar } from "./components/StatsBar";

type ElementMode = "include" | "any" | "exclude";

const CSV_HEADERS: (keyof MaterialRow)[] = [
  "materialId",
  "reducedFormula",
  "composition",
  "elements",
  "bandgap",
  "isMetal",
  "formationEnergyPerAtom",
  "decompositionEnergyPerAtom",
  "density",
  "volume",
  "nSites",
  "crystalSystem",
  "spaceGroup",
  "spaceGroupNumber",
  "pointGroup",
  "dimensionality",
];

function esc(v: unknown): string {
  const s = Array.isArray(v) ? v.join(";") : v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function rowsToCsv(rows: MaterialRow[]): string {
  const head = CSV_HEADERS.join(",");
  const body = rows
    .map((r) => CSV_HEADERS.map((h) => esc(r[h])).join(","))
    .join("\n");
  return head + "\n" + body;
}

function download(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function App() {
  const [filter, setFilter] = useState<Filter>(emptyFilter);
  const [elementMode, setElementMode] = useState<ElementMode>("include");
  const [rows, setRows] = useState<MaterialRow[]>([]);
  const [total, setTotal] = useState(-1);
  const [selected, setSelected] = useState<MaterialRow | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStats().then(setStats).catch((e) => setError(String(e)));
  }, []);

  const toggleElement = (sym: string) => {
    setFilter((f) => {
      const lists: Record<ElementMode, string[]> = {
        include: [...f.includeElements],
        any: [...f.includeAnyElements],
        exclude: [...f.excludeElements],
      };
      const cur = lists[elementMode];
      const idx = cur.indexOf(sym);
      if (idx >= 0) {
        cur.splice(idx, 1);
      } else {
        cur.push(sym);
        (Object.keys(lists) as ElementMode[])
          .filter((m) => m !== elementMode)
          .forEach((m) => {
            lists[m] = lists[m].filter((x) => x !== sym);
          });
      }
      return {
        ...f,
        includeElements: lists.include,
        includeAnyElements: lists.any,
        excludeElements: lists.exclude,
      };
    });
  };

  const clearElements = () =>
    setFilter((f) => ({
      ...f,
      includeElements: [],
      includeAnyElements: [],
      excludeElements: [],
    }));

  const onChange = (p: Partial<Filter>) => setFilter((f) => ({ ...f, ...p }));
  const onPreset = (f: Filter) => {
    setFilter(f);
    setElementMode("include");
  };
  const onReset = () => {
    setFilter(emptyFilter());
    setRows([]);
    setTotal(-1);
    setSelected(null);
    setElementMode("include");
  };

  const onRun = async () => {
    setLoading(true);
    setError(null);
    try {
      const [rs, ct] = await Promise.all([
        queryMaterials(filter),
        countMaterials(filter),
      ]);
      setRows(rs);
      setTotal(ct);
      setSelected(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const exportRows = (fmt: "csv" | "json") => {
    if (rows.length === 0) return;
    if (fmt === "json") {
      download(JSON.stringify(rows, null, 2), "gnome-materials.json", "application/json");
    } else {
      download(rowsToCsv(rows), "gnome-materials.csv", "text/csv");
    }
  };

  const exportSingle = (m: MaterialRow, fmt: "csv" | "json") => {
    if (fmt === "json") {
      download(JSON.stringify(m, null, 2), `${m.materialId}.json`, "application/json");
    } else {
      download(rowsToCsv([m]), `${m.materialId}.csv`, "text/csv");
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">GNoME</span>
          <span className="brand-sub">Materials Explorer</span>
        </div>
        <StatsBar stats={stats} />
      </header>

      <div className="body">
        <FilterPanel
          filter={filter}
          elementMode={elementMode}
          setElementMode={setElementMode}
          toggleElement={toggleElement}
          clearElements={clearElements}
          onChange={onChange}
          onPreset={onPreset}
          onReset={onReset}
          onRun={onRun}
          loading={loading}
          total={total}
        />

        <main className="main">
          <div className="main-head">
            <div className="main-title">
              查询结果
              {total >= 0 && (
                <span className="main-count">
                  共 {total.toLocaleString()} 条 · 显示 {rows.length}
                </span>
              )}
            </div>
            <div className="main-actions">
              <button onClick={() => exportRows("csv")} disabled={rows.length === 0}>
                导出 CSV
              </button>
              <button onClick={() => exportRows("json")} disabled={rows.length === 0}>
                导出 JSON
              </button>
            </div>
          </div>
          {error && <div className="error-bar">错误: {error}</div>}
          <ResultTable rows={rows} selectedId={selected?.materialId ?? null} onSelect={setSelected} />
        </main>

        <DetailPanel m={selected} onClose={() => setSelected(null)} onExport={exportSingle} />
      </div>
    </div>
  );
}
