// GNoME Materials Explorer — Rust 核心层
//
// 在进程内打开 in-memory DuckDB, 以 VIEW 形式挂载 Parquet 文件。
// 对前端暴露 5 个 Tauri command: 查询 / 计数 / 详情 / 概览统计 / CIF 结构读取。
// 用户输入的离散值(元素符号、晶系、维度)经白名单校验后内联, 数值用绑定参数。

use std::sync::Mutex;
use std::{fs::File, path::PathBuf};

use duckdb::{params, params_from_iter, Connection, ToSql};
use serde::{Deserialize, Serialize};

/// 周期表中本数据集出现过的 83 种元素, 作为元素符号白名单。
const ALLOWED_ELEMENTS: &[&str] = &[
    "Ac", "Ag", "Al", "As", "Au", "B", "Ba", "Be", "Bi", "Br", "C", "Ca", "Cd", "Ce", "Cl", "Co",
    "Cr", "Cs", "Cu", "Dy", "Er", "Eu", "F", "Fe", "Ga", "Gd", "Ge", "H", "Hf", "Hg", "Ho", "I",
    "In", "Ir", "K", "La", "Li", "Lu", "Mg", "Mn", "Mo", "N", "Na", "Nb", "Nd", "Ni", "Np", "O",
    "Os", "P", "Pa", "Pb", "Pd", "Pm", "Pr", "Pt", "Pu", "Rb", "Re", "Rh", "Ru", "S", "Sb", "Sc",
    "Se", "Si", "Sm", "Sn", "Sr", "Ta", "Tb", "Tc", "Te", "Th", "Ti", "Tl", "Tm", "U", "V", "W",
    "Y", "Zn", "Zr",
];

const VALID_CRYSTAL: &[&str] = &[
    "monoclinic",
    "orthorhombic",
    "triclinic",
    "hexagonal",
    "trigonal",
    "cubic",
    "tetragonal",
];

const VALID_DIM: &[&str] = &[
    "3D",
    "2D",
    "1D",
    "0D",
    "intercalated ion",
    "intercalated molecule",
];

const SELECT_COLS: &str = "material_id, reduced_formula, composition, \
     to_json(elements)::VARCHAR AS elements, bandgap, is_metal, \
     formation_energy_per_atom, decomposition_energy_per_atom, density, volume, \
     n_sites, crystal_system, space_group, space_group_number, point_group, dimensionality, \
    data_directory";

pub struct CachedZip {
    pub path: PathBuf,
    pub archive: zip::ZipArchive<File>,
}

pub struct AppState {
    pub conn: Mutex<Connection>,
    pub structure_zip: Mutex<Option<CachedZip>>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Filter {
    pub include_elements: Vec<String>,
    pub include_any_elements: Vec<String>,
    pub exclude_elements: Vec<String>,
    pub bandgap_min: Option<f64>,
    pub bandgap_max: Option<f64>,
    pub is_metal: Option<bool>,
    pub decomp_max: Option<f64>,
    pub formation_max: Option<f64>,
    pub density_min: Option<f64>,
    pub density_max: Option<f64>,
    pub crystal_systems: Vec<String>,
    pub dimensionalities: Vec<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialRow {
    pub material_id: String,
    pub reduced_formula: String,
    pub composition: String,
    pub elements: Vec<String>,
    pub bandgap: Option<f64>,
    pub is_metal: Option<bool>,
    pub formation_energy_per_atom: Option<f64>,
    pub decomposition_energy_per_atom: Option<f64>,
    pub density: Option<f64>,
    pub volume: Option<f64>,
    pub n_sites: Option<i32>,
    pub crystal_system: Option<String>,
    pub space_group: Option<String>,
    pub space_group_number: Option<i32>,
    pub point_group: Option<String>,
    pub dimensionality: Option<String>,
    pub data_directory: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Stats {
    pub total: i64,
    pub bandgap_buckets: BandgapBuckets,
    pub by_crystal: Vec<(String, i64)>,
    pub by_dimension: Vec<(String, i64)>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BandgapBuckets {
    pub metal: i64,
    pub semi_metal: i64,    // 0 ~ 0.5
    pub narrow: i64,        // 0.5 ~ 1.5
    pub semiconductor: i64, // 1.5 ~ 3
    pub insulator: i64,     // 3 ~ 6
    pub wide: i64,          // >= 6
    pub unknown: i64,
}

/// 把元素符号列表校验后构造成 SQL 数组字面量, 如 ARRAY['Li','Na']。
fn elements_literal(elems: &[String]) -> Result<String, String> {
    let mut out = Vec::with_capacity(elems.len());
    for e in elems {
        let t = e.trim();
        if !ALLOWED_ELEMENTS.iter().any(|x| *x == t) {
            return Err(format!("invalid element symbol: {t}"));
        }
        out.push(format!("'{t}'"));
    }
    Ok(format!("ARRAY[{}]", out.join(",")))
}

/// 离散值白名单校验后构造 IN 子句内容, 如 'cubic','monoclinic'。
fn whitelist_in(vals: &[String], allowed: &[&str]) -> Result<String, String> {
    let mut out = Vec::with_capacity(vals.len());
    for v in vals {
        if !allowed.iter().any(|a| *a == v.as_str()) {
            return Err(format!("invalid value: {v}"));
        }
        out.push(format!("'{v}'"));
    }
    Ok(out.join(","))
}

/// 依据 Filter 构造 WHERE 子句与绑定参数。离散分类值内联, 数值用 ? 占位。
fn build_where(f: &Filter) -> Result<(String, Vec<Box<dyn ToSql>>), String> {
    let mut clauses: Vec<String> = vec!["1=1".into()];
    let mut params: Vec<Box<dyn ToSql>> = Vec::new();

    if !f.include_elements.is_empty() {
        let lit = elements_literal(&f.include_elements)?;
        clauses.push(format!("list_has_all(elements, {lit}::VARCHAR[])"));
    }
    if !f.include_any_elements.is_empty() {
        let lit = elements_literal(&f.include_any_elements)?;
        clauses.push(format!("list_has_any(elements, {lit}::VARCHAR[])"));
    }
    if !f.exclude_elements.is_empty() {
        let lit = elements_literal(&f.exclude_elements)?;
        clauses.push(format!("NOT list_has_any(elements, {lit}::VARCHAR[])"));
    }
    if let Some(v) = f.bandgap_min {
        clauses.push("bandgap >= ?".into());
        params.push(Box::new(v));
    }
    if let Some(v) = f.bandgap_max {
        clauses.push("bandgap <= ?".into());
        params.push(Box::new(v));
    }
    if let Some(b) = f.is_metal {
        clauses.push("is_metal = ?".into());
        params.push(Box::new(b));
    }
    if let Some(v) = f.decomp_max {
        clauses.push("decomposition_energy_per_atom <= ?".into());
        params.push(Box::new(v));
    }
    if let Some(v) = f.formation_max {
        clauses.push("formation_energy_per_atom <= ?".into());
        params.push(Box::new(v));
    }
    if let Some(v) = f.density_min {
        clauses.push("density >= ?".into());
        params.push(Box::new(v));
    }
    if let Some(v) = f.density_max {
        clauses.push("density <= ?".into());
        params.push(Box::new(v));
    }
    if !f.crystal_systems.is_empty() {
        let list = whitelist_in(&f.crystal_systems, VALID_CRYSTAL)?;
        clauses.push(format!("crystal_system IN ({list})"));
    }
    if !f.dimensionalities.is_empty() {
        let list = whitelist_in(&f.dimensionalities, VALID_DIM)?;
        clauses.push(format!("dimensionality IN ({list})"));
    }
    Ok((clauses.join(" AND "), params))
}

fn row_to_material(r: &duckdb::Row) -> duckdb::Result<MaterialRow> {
    Ok(MaterialRow {
        material_id: r.get(0)?,
        reduced_formula: r.get(1)?,
        composition: r.get(2)?,
        elements: {
            let s: String = r.get(3)?;
            serde_json::from_str::<Vec<String>>(&s).unwrap_or_default()
        },
        bandgap: r.get(4)?,
        is_metal: r.get(5)?,
        formation_energy_per_atom: r.get(6)?,
        decomposition_energy_per_atom: r.get(7)?,
        density: r.get(8)?,
        volume: r.get(9)?,
        n_sites: r.get(10)?,
        crystal_system: r.get(11)?,
        space_group: r.get(12)?,
        space_group_number: r.get(13)?,
        point_group: r.get(14)?,
        dimensionality: r.get(15)?,
        data_directory: r.get(16)?,
    })
}

#[tauri::command]
fn query_materials(
    filter: Filter,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<MaterialRow>, String> {
    let (where_sql, mut params) = build_where(&filter)?;
    let limit = filter.limit.unwrap_or(100).clamp(1, 1000);
    let offset = filter.offset.unwrap_or(0).max(0);
    let sql = format!(
        "SELECT {SELECT_COLS} FROM materials WHERE {where_sql} ORDER BY material_id LIMIT ? OFFSET ?"
    );
    params.push(Box::new(limit));
    params.push(Box::new(offset));

    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params_from_iter(params.iter().map(|b| b.as_ref())), |r| {
            row_to_material(r)
        })
        .map_err(|e| e.to_string())?;
    let out: Result<Vec<_>, _> = rows.collect();
    out.map_err(|e| e.to_string())
}

#[tauri::command]
fn count_materials(filter: Filter, state: tauri::State<'_, AppState>) -> Result<i64, String> {
    let (where_sql, params) = build_where(&filter)?;
    let sql = format!("SELECT COUNT(*) FROM materials WHERE {where_sql}");
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let count: i64 = conn
        .query_row(
            &sql,
            params_from_iter(params.iter().map(|b| b.as_ref())),
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(count)
}

#[tauri::command]
fn get_material(
    material_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<Option<MaterialRow>, String> {
    let sql = format!("SELECT {SELECT_COLS} FROM materials WHERE material_id = ?");
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let res = conn.query_row(&sql, params![material_id], |r| row_to_material(r));
    match res {
        Ok(m) => Ok(Some(m)),
        Err(duckdb::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn stats(state: tauri::State<'_, AppState>) -> Result<Stats, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    let (total, metal, semi_metal, narrow, semiconductor, insulator, wide, unknown) = conn
        .query_row(
            "SELECT
                COUNT(*),
                SUM(CASE WHEN is_metal = TRUE THEN 1 ELSE 0 END),
                SUM(CASE WHEN is_metal = FALSE AND bandgap > 0 AND bandgap < 0.5 THEN 1 ELSE 0 END),
                SUM(CASE WHEN bandgap >= 0.5 AND bandgap < 1.5 THEN 1 ELSE 0 END),
                SUM(CASE WHEN bandgap >= 1.5 AND bandgap < 3 THEN 1 ELSE 0 END),
                SUM(CASE WHEN bandgap >= 3 AND bandgap < 6 THEN 1 ELSE 0 END),
                SUM(CASE WHEN bandgap >= 6 THEN 1 ELSE 0 END),
                SUM(CASE WHEN is_metal IS NULL THEN 1 ELSE 0 END)
             FROM materials",
            params![],
            |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    r.get::<_, i64>(1)?,
                    r.get::<_, i64>(2)?,
                    r.get::<_, i64>(3)?,
                    r.get::<_, i64>(4)?,
                    r.get::<_, i64>(5)?,
                    r.get::<_, i64>(6)?,
                    r.get::<_, i64>(7)?,
                ))
            },
        )
        .map_err(|e| e.to_string())?;

    let by_crystal = group_counts(&conn, "crystal_system")?;
    let by_dimension = group_counts(&conn, "dimensionality")?;

    Ok(Stats {
        total,
        bandgap_buckets: BandgapBuckets {
            metal,
            semi_metal,
            narrow,
            semiconductor,
            insulator,
            wide,
            unknown,
        },
        by_crystal,
        by_dimension,
    })
}

fn group_counts(conn: &Connection, col: &str) -> Result<Vec<(String, i64)>, String> {
    let sql = format!(
        "SELECT {col}, COUNT(*) AS c FROM materials WHERE {col} IS NOT NULL GROUP BY {col} ORDER BY c DESC"
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?))
        })
        .map_err(|e| e.to_string())?;
    let out: Result<Vec<_>, _> = rows.collect();
    out.map_err(|e| e.to_string())
}

// ───────────────────────── 晶体结构 (CIF) ─────────────────────────
//
// 从本地 by_id.zip 按 MaterialId 提取 CIF 并解析为晶胞 + 原子分数坐标。
// 不做空间群对称性展开: P1 直接用; 非 P1 返回原始坐标并标注 symmetry_applied=false
// (GNoME CIF 已是松弛后的完整结构, 原始坐标对 3D 可视化足够)。

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AtomSite {
    pub element: String,
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Structure {
    pub material_id: String,
    pub a: f64,
    pub b: f64,
    pub c: f64,
    pub alpha: f64,
    pub beta: f64,
    pub gamma: f64,
    pub space_group_number: Option<i32>,
    pub space_group_name: Option<String>,
    pub atoms: Vec<AtomSite>,
    /// 是否已应用空间群对称性展开。MVP 始终 false (用 CIF 原始坐标)。
    pub symmetry_applied: bool,
    pub raw_cif: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportedFile {
    pub filename: String,
    pub path: String,
}

/// 校验 MaterialId 格式: 仅允许小写十六进制 (CSV 中观察到的一致)。
fn valid_material_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 64 && id.bytes().all(|b| b.is_ascii_hexdigit())
}

/// 查找 by_id.zip 路径, 与 parquet 同目录。
fn resolve_zip() -> Result<PathBuf, String> {
    if let Ok(p) = std::env::var("GNOME_ZIP") {
        let pb = PathBuf::from(p);
        if pb.exists() {
            return Ok(pb);
        }
    }
    for c in [
        "data/gnome/by_id.zip",
        "../data/gnome/by_id.zip",
        "../../data/gnome/by_id.zip",
    ] {
        let p = PathBuf::from(c);
        if p.exists() {
            return Ok(p);
        }
    }
    Err("by_id.zip 未找到; 请下载并放入 data/gnome/ 或设置 GNOME_ZIP".into())
}

/// 解析 CIF 文本为 Structure。容忍 pymatgen 生成的格式变体。
fn parse_cif(material_id: &str, text: &str) -> Result<Structure, String> {
    let mut a = 0.0;
    let mut b = 0.0;
    let mut c = 0.0;
    let mut alpha = 90.0;
    let mut beta = 90.0;
    let mut gamma = 90.0;
    let mut sg_number: Option<i32> = None;
    let mut sg_name: Option<String> = None;

    // 行级扫描, 去掉首尾空白与行内注释。
    for line in text.lines() {
        let l = line.trim();
        if l.is_empty() {
            continue;
        }
        let mut it = l.split_whitespace();
        let key = it.next().unwrap_or("");
        match key {
            "_cell_length_a" => a = parse_field(it.next()),
            "_cell_length_b" => b = parse_field(it.next()),
            "_cell_length_c" => c = parse_field(it.next()),
            "_cell_angle_alpha" => alpha = parse_field(it.next()),
            "_cell_angle_beta" => beta = parse_field(it.next()),
            "_cell_angle_gamma" => gamma = parse_field(it.next()),
            "_symmetry_Int_Tables_number" => {
                sg_number = it.next().and_then(|s| s.trim_matches('\'').parse().ok())
            }
            "_symmetry_space_group_name_H-M" => {
                let raw = l
                    .strip_prefix("_symmetry_space_group_name_H-M")
                    .unwrap_or("")
                    .trim();
                sg_name = Some(unquote_cif(raw));
            }
            _ => {}
        }
    }

    // 解析原子坐标 loop_。定位 _atom_site_type_symbol 行, 之后每行一个原子。
    let atoms = parse_atom_loop(text)?;

    Ok(Structure {
        material_id: material_id.to_string(),
        a,
        b,
        c,
        alpha,
        beta,
        gamma,
        space_group_number: sg_number,
        space_group_name: sg_name,
        atoms,
        symmetry_applied: false,
        raw_cif: text.to_string(),
    })
}

fn parse_field(s: Option<&str>) -> f64 {
    s.and_then(|v| {
        let cleaned = v
            .trim_matches('\'')
            .trim_matches('"')
            .split('(')
            .next()
            .unwrap_or(v);
        cleaned.parse().ok()
    })
    .unwrap_or(0.0)
}

fn unquote_cif(s: &str) -> String {
    let t = s.trim();
    if t.len() >= 2
        && ((t.starts_with('\'') && t.ends_with('\'')) || (t.starts_with('"') && t.ends_with('"')))
    {
        t[1..t.len() - 1].to_string()
    } else {
        t.to_string()
    }
}

/// 从 CIF 提取原子坐标。定位 _atom_site_type_symbol 列, 按列索引读取后续数据行。
fn parse_atom_loop(text: &str) -> Result<Vec<AtomSite>, String> {
    let lines: Vec<&str> = text.lines().collect();
    // 找到 loop_ 块内 _atom_site_* 列定义的起始。
    let mut col_start = None;
    for (i, line) in lines.iter().enumerate() {
        if line.trim() == "loop_" {
            // 检查紧随其后的列是否包含 _atom_site_type_symbol
            let mut j = i + 1;
            let mut has_symbol = false;
            while j < lines.len() && lines[j].trim().starts_with("_atom_site_") {
                if lines[j].trim() == "_atom_site_type_symbol" {
                    has_symbol = true;
                }
                j += 1;
            }
            if has_symbol {
                col_start = Some(i + 1);
                break;
            }
        }
    }
    let col_start = col_start.ok_or("未找到原子坐标 loop_ 块")?;

    // 收集列名 → 列索引
    let mut symbol_col = None;
    let mut x_col = None;
    let mut y_col = None;
    let mut z_col = None;
    let mut idx = 0;
    let mut data_start = col_start;
    for (k, line) in lines.iter().enumerate().skip(col_start) {
        let t = line.trim();
        if t.starts_with("_atom_site_") {
            match t {
                "_atom_site_type_symbol" => symbol_col = Some(idx),
                "_atom_site_fract_x" => x_col = Some(idx),
                "_atom_site_fract_y" => y_col = Some(idx),
                "_atom_site_fract_z" => z_col = Some(idx),
                _ => {}
            }
            idx += 1;
            data_start = k + 1;
        } else {
            break;
        }
    }

    let symbol_col = symbol_col.ok_or("缺少 _atom_site_type_symbol 列")?;
    let x_col = x_col.ok_or("缺少 _atom_site_fract_x 列")?;
    let y_col = y_col.ok_or("缺少 _atom_site_fract_y 列")?;
    let z_col = z_col.ok_or("缺少 _atom_site_fract_z 列")?;

    let mut atoms = Vec::new();
    for line in lines.iter().skip(data_start) {
        let t = line.trim();
        if t.is_empty() || t.starts_with('_') || t.starts_with("loop_") || t.starts_with("data_") {
            break;
        }
        let parts: Vec<&str> = t.split_whitespace().collect();
        let max_col = symbol_col.max(x_col).max(y_col).max(z_col);
        if parts.len() <= max_col {
            break;
        }
        // 元素符号可能带数字后缀 (如 "Fe1"), 取字母部分。
        let elem = parts[symbol_col]
            .chars()
            .take_while(|ch| ch.is_alphabetic())
            .collect::<String>();
        let x = parse_field(Some(parts[x_col]));
        let y = parse_field(Some(parts[y_col]));
        let z = parse_field(Some(parts[z_col]));
        atoms.push(AtomSite {
            element: elem,
            x,
            y,
            z,
        });
    }
    if atoms.is_empty() {
        return Err("未解析到原子坐标".into());
    }
    Ok(atoms)
}

fn read_cif_text(material_id: &str, state: &AppState) -> Result<String, String> {
    let zip_path = resolve_zip()?;
    let mut cached = state.structure_zip.lock().map_err(|e| e.to_string())?;
    let need_open = cached.as_ref().map(|z| z.path != zip_path).unwrap_or(true);
    if need_open {
        let file = File::open(&zip_path).map_err(|e| e.to_string())?;
        let archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
        *cached = Some(CachedZip {
            path: zip_path.clone(),
            archive,
        });
    }
    let archive = &mut cached.as_mut().ok_or("by_id.zip 打开失败")?.archive;
    let entry_name = format!("by_id/{material_id}.CIF");
    let mut entry = archive
        .by_name(&entry_name)
        .map_err(|e| format!("zip 内未找到 {entry_name}: {e}"))?;
    let mut text = String::new();
    use std::io::Read;
    entry.read_to_string(&mut text).map_err(|e| e.to_string())?;
    Ok(text)
}

#[tauri::command]
fn get_structure(
    material_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<Structure, String> {
    if !valid_material_id(&material_id) {
        return Err(format!("无效的 MaterialId: {material_id}"));
    }
    let text = read_cif_text(&material_id, state.inner())?;
    parse_cif(&material_id, &text)
}

#[tauri::command]
fn export_cif(
    material_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<ExportedFile, String> {
    if !valid_material_id(&material_id) {
        return Err(format!("无效的 MaterialId: {material_id}"));
    }
    let text = read_cif_text(&material_id, state.inner())?;
    let filename = format!("{material_id}.cif");
    let dir = dirs::download_dir()
        .or_else(|| std::env::current_dir().ok())
        .ok_or("无法确定导出目录")?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建导出目录失败: {e}"))?;
    let path = dir.join(&filename);
    std::fs::write(&path, text).map_err(|e| format!("写入 CIF 失败: {e}"))?;
    Ok(ExportedFile {
        filename,
        path: path.to_string_lossy().to_string(),
    })
}

/// 查找 materials.parquet: 环境变量优先, 再尝试若干相对路径。
fn resolve_parquet() -> Result<std::path::PathBuf, String> {
    if let Ok(p) = std::env::var("GNOME_PARQUET") {
        let pb = std::path::PathBuf::from(p);
        if pb.exists() {
            return Ok(pb);
        }
    }
    for c in [
        "data/gnome/materials.parquet",
        "../data/gnome/materials.parquet",
        "../../data/gnome/materials.parquet",
    ] {
        let p = std::path::PathBuf::from(c);
        if p.exists() {
            return Ok(p);
        }
    }
    Err("materials.parquet 未找到; 请设置 GNOME_PARQUET 环境变量".into())
}

fn open_db() -> Result<Connection, String> {
    let parquet = resolve_parquet()?;
    let conn = Connection::open_in_memory().map_err(|e| e.to_string())?;
    // Windows 路径用正斜杠更安全; 单引号转义。
    let path = parquet
        .to_string_lossy()
        .replace('\\', "/")
        .replace('\'', "''");
    conn.execute_batch(&format!(
        "CREATE VIEW materials AS SELECT * FROM read_parquet('{path}')"
    ))
    .map_err(|e| e.to_string())?;
    Ok(conn)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_pymatgen_cif_with_spaced_space_group() {
        let cif = r#"# generated using pymatgen
data_Test
_symmetry_space_group_name_H-M   'P 1'
_cell_length_a   7.67804201(2)
_cell_length_b   7.74745192
_cell_length_c   4.08114700
_cell_angle_alpha   90.00000000
_cell_angle_beta   90.00000000
_cell_angle_gamma   120.30244159
_symmetry_Int_Tables_number   1
loop_
 _atom_site_type_symbol
 _atom_site_label
 _atom_site_symmetry_multiplicity
 _atom_site_fract_x
 _atom_site_fract_y
 _atom_site_fract_z
 _atom_site_occupancy
  Pr  Pr0  1  0.411028  0.413100  0.000000  1
  Nd  Nd1  1  0.589079  0.002119  0.500000  1
"#;

        let structure = parse_cif("bcc7a64ee3", cif).expect("CIF should parse");
        assert_eq!(structure.space_group_name.as_deref(), Some("P 1"));
        assert_eq!(structure.space_group_number, Some(1));
        assert!((structure.a - 7.67804201).abs() < 1e-9);
        assert_eq!(structure.atoms.len(), 2);
        assert_eq!(structure.atoms[0].element, "Pr");
        assert_eq!(structure.atoms[1].element, "Nd");
    }

    #[test]
    fn rejects_invalid_material_ids() {
        assert!(valid_material_id("bcc7a64ee3"));
        assert!(!valid_material_id("../bcc7a64ee3"));
        assert!(!valid_material_id(""));
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let conn = match open_db() {
        Ok(c) => c,
        Err(e) => panic!("{e}"),
    };
    let state = AppState {
        conn: Mutex::new(conn),
        structure_zip: Mutex::new(None),
    };

    tauri::Builder::default()
        .manage(state)
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            query_materials,
            count_materials,
            get_material,
            stats,
            get_structure,
            export_cif
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
