// 与 Rust 端 Filter / MaterialRow / Stats 对应的类型 (serde camelCase)。

export interface Filter {
  includeElements: string[];
  includeAnyElements: string[];
  excludeElements: string[];
  bandgapMin: number | null;
  bandgapMax: number | null;
  isMetal: boolean | null;
  decompMax: number | null;
  formationMax: number | null;
  densityMin: number | null;
  densityMax: number | null;
  crystalSystems: string[];
  dimensionalities: string[];
  limit: number;
  offset: number;
}

export interface MaterialRow {
  materialId: string;
  reducedFormula: string;
  composition: string;
  elements: string[];
  bandgap: number | null;
  isMetal: boolean | null;
  formationEnergyPerAtom: number | null;
  decompositionEnergyPerAtom: number | null;
  density: number | null;
  volume: number | null;
  nSites: number | null;
  crystalSystem: string | null;
  spaceGroup: string | null;
  spaceGroupNumber: number | null;
  pointGroup: string | null;
  dimensionality: string | null;
  dataDirectory: string | null;
}

export interface BandgapBuckets {
  metal: number;
  semiMetal: number;
  narrow: number;
  semiconductor: number;
  insulator: number;
  wide: number;
  unknown: number;
}

export interface Stats {
  total: number;
  bandgapBuckets: BandgapBuckets;
  byCrystal: [string, number][];
  byDimension: [string, number][];
}

export const emptyFilter = (): Filter => ({
  includeElements: [],
  includeAnyElements: [],
  excludeElements: [],
  bandgapMin: null,
  bandgapMax: null,
  isMetal: null,
  decompMax: null,
  formationMax: null,
  densityMin: null,
  densityMax: null,
  crystalSystems: [],
  dimensionalities: [],
  limit: 200,
  offset: 0,
});
