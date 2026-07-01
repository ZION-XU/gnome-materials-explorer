import { invoke } from "@tauri-apps/api/core";
import type { ExportedFile, Filter, MaterialRow, Stats, Structure } from "./types";

export const queryMaterials = (filter: Filter): Promise<MaterialRow[]> =>
  invoke<MaterialRow[]>("query_materials", { filter });

export const countMaterials = (filter: Filter): Promise<number> =>
  invoke<number>("count_materials", { filter });

export const getMaterial = (materialId: string): Promise<MaterialRow | null> =>
  invoke<MaterialRow | null>("get_material", { materialId });

export const fetchStats = (): Promise<Stats> => invoke<Stats>("stats");

export const getStructure = (materialId: string): Promise<Structure> =>
  invoke<Structure>("get_structure", { materialId });

export const exportCif = (materialId: string): Promise<ExportedFile> =>
  invoke<ExportedFile>("export_cif", { materialId });

export const exportPoscar = (materialId: string): Promise<ExportedFile> =>
  invoke<ExportedFile>("export_poscar", { materialId });

export const exportQeInput = (materialId: string): Promise<ExportedFile> =>
  invoke<ExportedFile>("export_qe_input", { materialId });
