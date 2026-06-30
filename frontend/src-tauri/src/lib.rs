// GNoME Materials Explorer — Rust 核心层
//
// 在进程内打开 in-memory DuckDB, 以 VIEW 形式挂载 Parquet 文件。
// 对前端暴露 4 个 Tauri command: 查询 / 计数 / 详情 / 概览统计。
// 用户输入的离散值(元素符号、晶系、维度)经白名单校验后内联, 数值用绑定参数。

use std::sync::Mutex;

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

pub struct DbState(pub Mutex<Connection>);

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
    pub semi_metal: i64, // 0 ~ 0.5
    pub narrow: i64,     // 0.5 ~ 1.5
    pub semiconductor: i64, // 1.5 ~ 3
    pub insulator: i64,  // 3 ~ 6
    pub wide: i64,       // >= 6
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
    state: tauri::State<'_, DbState>,
) -> Result<Vec<MaterialRow>, String> {
    let (where_sql, mut params) = build_where(&filter)?;
    let limit = filter.limit.unwrap_or(100).clamp(1, 1000);
    let offset = filter.offset.unwrap_or(0).max(0);
    let sql = format!(
        "SELECT {SELECT_COLS} FROM materials WHERE {where_sql} ORDER BY material_id LIMIT ? OFFSET ?"
    );
    params.push(Box::new(limit));
    params.push(Box::new(offset));

    let conn = state.0.lock().map_err(|e| e.to_string())?;
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
fn count_materials(filter: Filter, state: tauri::State<'_, DbState>) -> Result<i64, String> {
    let (where_sql, params) = build_where(&filter)?;
    let sql = format!("SELECT COUNT(*) FROM materials WHERE {where_sql}");
    let conn = state.0.lock().map_err(|e| e.to_string())?;
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
    state: tauri::State<'_, DbState>,
) -> Result<Option<MaterialRow>, String> {
    let sql = format!("SELECT {SELECT_COLS} FROM materials WHERE material_id = ?");
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let res = conn.query_row(&sql, params![material_id], |r| row_to_material(r));
    match res {
        Ok(m) => Ok(Some(m)),
        Err(duckdb::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn stats(state: tauri::State<'_, DbState>) -> Result<Stats, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

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
        .query_map(params![], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))
        .map_err(|e| e.to_string())?;
    let out: Result<Vec<_>, _> = rows.collect();
    out.map_err(|e| e.to_string())
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
    let path = parquet.to_string_lossy().replace('\\', "/").replace('\'', "''");
    conn.execute_batch(&format!(
        "CREATE VIEW materials AS SELECT * FROM read_parquet('{path}')"
    ))
    .map_err(|e| e.to_string())?;
    Ok(conn)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let conn = match open_db() {
        Ok(c) => c,
        Err(e) => panic!("{e}"),
    };
    let state = DbState(Mutex::new(conn));

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
            stats
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
