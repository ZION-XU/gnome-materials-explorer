import type { Filter } from "../types";
import { PRESETS } from "../presets";
import { BATTERY_FAMILIES } from "../battery";
import { PeriodicTable } from "./PeriodicTable";

type ElementMode = "include" | "any" | "exclude";

interface Props {
  filter: Filter;
  elementMode: ElementMode;
  setElementMode: (m: ElementMode) => void;
  toggleElement: (s: string) => void;
  clearElements: () => void;
  onChange: (p: Partial<Filter>) => void;
  onPreset: (f: Filter) => void;
  onReset: () => void;
  onRun: () => void;
  loading: boolean;
  total: number;
}

const CRYSTAL: [string, string][] = [
  ["monoclinic", "单斜"],
  ["orthorhombic", "正交"],
  ["triclinic", "三斜"],
  ["hexagonal", "六方"],
  ["trigonal", "三方"],
  ["cubic", "立方"],
  ["tetragonal", "四方"],
];

const DIM: [string, string][] = [
  ["3D", "三维"],
  ["2D", "二维"],
  ["1D", "一维"],
  ["0D", "零维"],
  ["intercalated ion", "插层离子"],
  ["intercalated molecule", "插层分子"],
];

const MODES: [ElementMode, string][] = [
  ["include", "必须包含"],
  ["any", "含任一"],
  ["exclude", "排除"],
];

function NumField({
  label,
  value,
  onChange,
  step = "0.1",
  placeholder = "不限",
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  step?: string;
  placeholder?: string;
}) {
  return (
    <label className="numfield">
      <span className="nf-label">{label}</span>
      <input
        type="number"
        step={step}
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) =>
          onChange(e.target.value === "" ? null : Number(e.target.value))
        }
      />
    </label>
  );
}

function toggleArr(arr: string[], v: string, on: boolean): string[] {
  return on ? [...arr, v] : arr.filter((x) => x !== v);
}

export function FilterPanel({
  filter,
  elementMode,
  setElementMode,
  toggleElement,
  clearElements,
  onChange,
  onPreset,
  onReset,
  onRun,
  loading,
  total,
}: Props) {
  const chips: [ElementMode, string, string][] = [
    ["include", "包含", filter.includeElements.join(",")],
    ["any", "任一", filter.includeAnyElements.join(",")],
    ["exclude", "排除", filter.excludeElements.join(",")],
  ];

  return (
    <aside className="filter-panel">
      <section className="fp-section">
        <h4>应用预设</h4>
        <div className="presets">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              className="preset-btn"
              title={p.desc}
              onClick={() => onPreset(p.apply())}
            >
              {p.name}
            </button>
          ))}
        </div>
      </section>

      <section className="fp-section">
        <div className="fp-head">
          <h4>元素筛选</h4>
          <button className="link" onClick={clearElements}>清空</button>
        </div>
        <div className="mode-switch">
          {MODES.map(([m, label]) => (
            <button
              key={m}
              className={`mode-btn mode-${m} ${elementMode === m ? "active" : ""}`}
              onClick={() => setElementMode(m)}
            >
              {label}
            </button>
          ))}
        </div>
        <PeriodicTable
          include={filter.includeElements}
          any={filter.includeAnyElements}
          exclude={filter.excludeElements}
          onToggle={toggleElement}
        />
        <div className="chips">
          {chips.map(([m, label, vals]) =>
            vals ? (
              <div key={m} className={`chip-line chip-${m}`}>
                <span className="chip-tag">{label}</span>
                <span className="chip-vals">{vals}</span>
              </div>
            ) : null,
          )}
        </div>
      </section>

      <section className="fp-section">
        <h4>带隙 (eV)</h4>
        <div className="num-row">
          <NumField
            label="最小"
            value={filter.bandgapMin}
            onChange={(v) => onChange({ bandgapMin: v })}
          />
          <NumField
            label="最大"
            value={filter.bandgapMax}
            onChange={(v) => onChange({ bandgapMax: v })}
          />
        </div>
        <div className="tri-state">
          {(
            [
              ["all", "全部", null],
              ["metal", "金属", true],
              ["non", "非金属", false],
            ] as [string, string, boolean | null][]
          ).map(([id, label, val]) => (
            <button
              key={id}
              className={`ts-btn ${filter.isMetal === val ? "active" : ""}`}
              onClick={() => onChange({ isMetal: val })}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="fp-section">
        <h4>稳定性</h4>
        <div className="num-row">
          <NumField
            label="分解能 ≤"
            value={filter.decompMax}
            step="0.01"
            onChange={(v) => onChange({ decompMax: v })}
          />
          <NumField
            label="形成能 ≤"
            value={filter.formationMax}
            step="0.1"
            onChange={(v) => onChange({ formationMax: v })}
          />
        </div>
      </section>

      <section className="fp-section">
        <h4>密度 (g/cm³)</h4>
        <div className="num-row">
          <NumField
            label="最小"
            value={filter.densityMin}
            onChange={(v) => onChange({ densityMin: v })}
          />
          <NumField
            label="最大"
            value={filter.densityMax}
            onChange={(v) => onChange({ densityMax: v })}
          />
        </div>
      </section>

      <section className="fp-section">
        <h4>固态电池候选族</h4>
        <div className="family-grid">
          {BATTERY_FAMILIES.map((family) => (
            <label key={family.id} className="chk family-chk" title={family.desc}>
              <input
                type="checkbox"
                checked={filter.batteryFamilies.includes(family.id)}
                onChange={(e) =>
                  onChange({
                    batteryFamilies: toggleArr(filter.batteryFamilies, family.id, e.target.checked),
                  })
                }
              />
              <span>{family.name}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="fp-section">
        <h4>晶系</h4>
        <div className="chk-grid">
          {CRYSTAL.map(([en, zh]) => (
            <label key={en} className="chk">
              <input
                type="checkbox"
                checked={filter.crystalSystems.includes(en)}
                onChange={(e) =>
                  onChange({
                    crystalSystems: toggleArr(filter.crystalSystems, en, e.target.checked),
                  })
                }
              />
              {zh}
            </label>
          ))}
        </div>
      </section>

      <section className="fp-section">
        <h4>维度</h4>
        <div className="chk-grid">
          {DIM.map(([en, zh]) => (
            <label key={en} className="chk">
              <input
                type="checkbox"
                checked={filter.dimensionalities.includes(en)}
                onChange={(e) =>
                  onChange({
                    dimensionalities: toggleArr(filter.dimensionalities, en, e.target.checked),
                  })
                }
              />
              {zh}
            </label>
          ))}
        </div>
      </section>

      <section className="fp-actions">
        <button className="run-btn" onClick={onRun} disabled={loading}>
          {loading ? "查询中…" : "查询"}
        </button>
        <button className="reset-btn" onClick={onReset}>
          重置
        </button>
        <span className="count">
          {total >= 0 ? `${total.toLocaleString()} 条` : ""}
        </span>
      </section>
    </aside>
  );
}
