import { invoke } from "@tauri-apps/api/core";
import type { Filter, MaterialRow, Stats } from "./types";

export const queryMaterials = (filter: Filter): Promise<MaterialRow[]> =>
  invoke<MaterialRow[]>("query_materials", { filter });

export const countMaterials = (filter: Filter): Promise<number> =>
  invoke<number>("count_materials", { filter });

export const getMaterial = (materialId: string): Promise<MaterialRow | null> =>
  invoke<MaterialRow | null>("get_material", { materialId });

export const fetchStats = (): Promise<Stats> => invoke<Stats>("stats");
