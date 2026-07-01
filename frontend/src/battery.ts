import type { MaterialRow } from "./types";

export interface BatteryFamily {
  id: string;
  name: string;
  shortName: string;
  desc: string;
}

export interface BatteryAssessment {
  families: BatteryFamily[];
  reasons: string[];
  score: "high" | "medium" | "low" | "none";
  scoreLabel: string;
}

export const BATTERY_FAMILIES: BatteryFamily[] = [
  {
    id: "li_thiophosphate",
    name: "锂硫/硒磷族电解质",
    shortName: "Li-P-S/Se",
    desc: "含 Li-P 且含 S/Se，类似 LGPS/硫代磷酸盐方向",
  },
  {
    id: "li_halide",
    name: "锂卤化物电解质",
    shortName: "Li-X",
    desc: "含 Li 和卤素，排除明显氧/硫/硒体系，类似 Li₃YCl₆ 等方向",
  },
  {
    id: "li_nasicon",
    name: "锂 NASICON 型氧化物",
    shortName: "Li-NASICON",
    desc: "含 Li-P-O 与 Ti/Zr/Ge/Si/Al/Hf/Sn/Nb/Ta 等骨架元素",
  },
  {
    id: "li_garnet",
    name: "锂石榴石氧化物",
    shortName: "Li-garnet",
    desc: "含 Li-La-O 与 Zr/Ta/Nb/Sn/Hf，类似 LLZO 方向",
  },
  {
    id: "na_thiophosphate",
    name: "钠硫/硒磷族电解质",
    shortName: "Na-P-S/Se",
    desc: "含 Na-P 且含 S/Se，钠固态电解质候选方向",
  },
  {
    id: "na_nasicon",
    name: "钠 NASICON 型氧化物",
    shortName: "Na-NASICON",
    desc: "含 Na-P-O 与 Ti/Zr/Ge/Si/V/Al/Hf/Sn/Nb/Ta 等骨架元素",
  },
  {
    id: "na_halide",
    name: "钠卤化物电解质",
    shortName: "Na-X",
    desc: "含 Na 和卤素，排除明显氧/硫/硒体系",
  },
];

export const ALL_BATTERY_FAMILY_IDS = BATTERY_FAMILIES.map((family) => family.id);

const familyById = new Map(BATTERY_FAMILIES.map((family) => [family.id, family]));
const frameworkLiNasicon = new Set(["Ti", "Zr", "Ge", "Si", "Al", "Hf", "Sn", "Nb", "Ta"]);
const frameworkNaNasicon = new Set(["Ti", "Zr", "Ge", "Si", "V", "Al", "Hf", "Sn", "Nb", "Ta"]);
const frameworkGarnet = new Set(["Zr", "Ta", "Nb", "Sn", "Hf"]);
const halogens = new Set(["F", "Cl", "Br", "I"]);
const chalcogenides = new Set(["S", "Se"]);

const hasAny = (elements: Set<string>, targets: Iterable<string>) => {
  for (const target of targets) {
    if (elements.has(target)) return true;
  }
  return false;
};

const familyMatches = (id: string, elements: Set<string>) => {
  switch (id) {
    case "li_thiophosphate":
      return elements.has("Li") && elements.has("P") && hasAny(elements, chalcogenides);
    case "li_halide":
      return elements.has("Li") && hasAny(elements, halogens) && !hasAny(elements, ["O", "S", "Se"]);
    case "li_nasicon":
      return elements.has("Li") && elements.has("P") && elements.has("O") && hasAny(elements, frameworkLiNasicon);
    case "li_garnet":
      return elements.has("Li") && elements.has("La") && elements.has("O") && hasAny(elements, frameworkGarnet);
    case "na_thiophosphate":
      return elements.has("Na") && elements.has("P") && hasAny(elements, chalcogenides);
    case "na_nasicon":
      return elements.has("Na") && elements.has("P") && elements.has("O") && hasAny(elements, frameworkNaNasicon);
    case "na_halide":
      return elements.has("Na") && hasAny(elements, halogens) && !hasAny(elements, ["O", "S", "Se"]);
    default:
      return false;
  }
};

export const batteryFamilyName = (id: string) => familyById.get(id)?.name ?? id;

export function assessBatteryCandidate(m: MaterialRow): BatteryAssessment {
  const elements = new Set(m.elements);
  const families = BATTERY_FAMILIES.filter((family) => familyMatches(family.id, elements));
  if (families.length === 0) {
    return { families: [], reasons: [], score: "none", scoreLabel: "—" };
  }

  const reasons: string[] = [];
  const hasMobileIon = elements.has("Li") || elements.has("Na");
  if (hasMobileIon) reasons.push("含 Li/Na 移动离子");
  if (m.decompositionEnergyPerAtom != null) {
    if (m.decompositionEnergyPerAtom <= 0.05) {
      reasons.push("距凸包 ≤ 0.05 eV/atom，稳定性优先级高");
    } else if (m.decompositionEnergyPerAtom <= 0.1) {
      reasons.push("距凸包 ≤ 0.1 eV/atom，可能可合成");
    } else {
      reasons.push("稳定性需谨慎复核");
    }
  }
  if (m.isMetal === false) reasons.push("非金属，更接近固态电解质筛选目标");
  if (m.bandgap != null && m.bandgap >= 2) reasons.push("带隙较高，有利于电子绝缘");
  reasons.push("GNoME 只负责候选缩小，需继续做 NEB/MD 验证离子迁移");

  const stable = m.decompositionEnergyPerAtom != null && m.decompositionEnergyPerAtom <= 0.1;
  const veryStable = m.decompositionEnergyPerAtom != null && m.decompositionEnergyPerAtom <= 0.05;
  const insulating = m.isMetal === false || (m.bandgap != null && m.bandgap >= 1.5);
  const score: BatteryAssessment["score"] = veryStable && insulating ? "high" : stable ? "medium" : "low";
  const scoreLabel = score === "high" ? "优先" : score === "medium" ? "可跟进" : "待复核";

  return { families, reasons, score, scoreLabel };
}
