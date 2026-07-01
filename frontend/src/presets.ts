import type { Filter } from "./types";
import { emptyFilter } from "./types";
import { RARE_EARTH } from "./elements";
import { ALL_BATTERY_FAMILY_IDS } from "./battery";

// 应用导向预设: 一键填入常见材料筛选条件。
// decompMax 取 0.1 eV/atom 作为"距凸包足够近、可能可合成"的经验阈值。
export interface Preset {
  id: string;
  name: string;
  desc: string;
  apply: () => Filter;
}

export const PRESETS: Preset[] = [
  {
    id: "na-battery",
    name: "钠离子电池候选",
    desc: "含 Na · 距凸包 ≤ 0.1 eV",
    apply: () => ({ ...emptyFilter(), includeElements: ["Na"], decompMax: 0.1 }),
  },
  {
    id: "solid-electrolyte-all",
    name: "固态电解质候选",
    desc: "Li/Na 硫化物、卤化物、NASICON、石榴石族 · 非金属 · 距凸包 ≤ 0.1 eV",
    apply: () => ({
      ...emptyFilter(),
      batteryFamilies: [...ALL_BATTERY_FAMILY_IDS],
      isMetal: false,
      decompMax: 0.1,
    }),
  },
  {
    id: "li-thiophosphate",
    name: "锂硫化物电解质",
    desc: "Li-P-S/Se 族 · 非金属 · 距凸包 ≤ 0.1 eV",
    apply: () => ({
      ...emptyFilter(),
      batteryFamilies: ["li_thiophosphate"],
      isMetal: false,
      decompMax: 0.1,
    }),
  },
  {
    id: "li-halide-electrolyte",
    name: "锂卤化物电解质",
    desc: "Li-X 族 · 非金属 · 距凸包 ≤ 0.1 eV",
    apply: () => ({
      ...emptyFilter(),
      batteryFamilies: ["li_halide"],
      isMetal: false,
      decompMax: 0.1,
    }),
  },
  {
    id: "li-nasicon-electrolyte",
    name: "锂 NASICON",
    desc: "Li-P-O 骨架 · 非金属 · 距凸包 ≤ 0.1 eV",
    apply: () => ({
      ...emptyFilter(),
      batteryFamilies: ["li_nasicon"],
      isMetal: false,
      decompMax: 0.1,
    }),
  },
  {
    id: "li-garnet-electrolyte",
    name: "锂石榴石氧化物",
    desc: "Li-La-O-Zr/Ta/Nb 方向 · 非金属 · 距凸包 ≤ 0.1 eV",
    apply: () => ({
      ...emptyFilter(),
      batteryFamilies: ["li_garnet"],
      isMetal: false,
      decompMax: 0.1,
    }),
  },
  {
    id: "na-nasicon-electrolyte",
    name: "钠 NASICON",
    desc: "Na-P-O 骨架 · 非金属 · 距凸包 ≤ 0.1 eV",
    apply: () => ({
      ...emptyFilter(),
      batteryFamilies: ["na_nasicon"],
      isMetal: false,
      decompMax: 0.1,
    }),
  },
  {
    id: "li-battery",
    name: "锂离子电池候选",
    desc: "含 Li · 距凸包 ≤ 0.1 eV",
    apply: () => ({ ...emptyFilter(), includeElements: ["Li"], decompMax: 0.1 }),
  },
  {
    id: "photocatalyst",
    name: "光伏/光催化半导体",
    desc: "带隙 1.5–3.0 eV · 非金属 · 稳定",
    apply: () => ({
      ...emptyFilter(),
      bandgapMin: 1.5,
      bandgapMax: 3.0,
      isMetal: false,
      decompMax: 0.1,
    }),
  },
  {
    id: "rare-earth",
    name: "稀土功能材料",
    desc: "含任一稀土 · 稳定",
    apply: () => ({
      ...emptyFilter(),
      includeAnyElements: [...RARE_EARTH],
      decompMax: 0.1,
    }),
  },
  {
    id: "insulator",
    name: "宽禁带绝缘体",
    desc: "带隙 3–6 eV · 非金属",
    apply: () => ({
      ...emptyFilter(),
      bandgapMin: 3.0,
      bandgapMax: 6.0,
      isMetal: false,
    }),
  },
  {
    id: "metal",
    name: "金属导体",
    desc: "带隙为 0 (金属)",
    apply: () => ({ ...emptyFilter(), isMetal: true }),
  },
];
