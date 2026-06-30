"""
CSV -> Parquet 预处理脚本。

输入: data/gnome/stable_materials_summary.csv (151MB, 554219 行)
输出: data/gnome/materials.parquet (列式压缩, 查询毫秒级)

字段清洗:
  - Elements: "['S', 'Zr', 'Cs']" -> LIST<VARCHAR> (支持 list_contains 筛选)
  - Bandgap: 'inf' (金属) -> NULL, is_metal=TRUE
            '' / 空 -> NULL, is_metal=NULL
            数值 -> DOUBLE, is_metal=FALSE
  - 数值字段强制类型转换, 非法值 -> NULL
"""
import sys
from pathlib import Path
import duckdb

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "data" / "gnome" / "stable_materials_summary.csv"
DST = ROOT / "data" / "gnome" / "materials.parquet"


def main() -> int:
    if not SRC.exists():
        print(f"[ERR] 源文件不存在: {SRC}", file=sys.stderr)
        return 1

    print(f"[1/3] 读取并转换: {SRC.name}")
    con = duckdb.connect()

    # 直接读 CSV 建表, 同时做字段清洗
    con.execute(f"""
        CREATE TABLE materials AS
        SELECT
            "MaterialId"                       AS material_id,
            "Composition"                      AS composition,
            "Reduced Formula"                  AS reduced_formula,
            LIST_TRANSFORM(
                string_split(
                    replace(replace(replace(replace("Elements", '[', ''), ']', ''), '"', ''), chr(39), ''),
                    ','
                ),
                x -> TRIM(x)
            ) AS elements,
            TRY_CAST("NSites" AS INTEGER)      AS n_sites,
            TRY_CAST("Volume" AS DOUBLE)       AS volume,
            TRY_CAST("Density" AS DOUBLE)      AS density,
            "Point Group"                      AS point_group,
            "Space Group"                      AS space_group,
            TRY_CAST("Space Group Number" AS INTEGER) AS space_group_number,
            "Crystal System"                   AS crystal_system,
            TRY_CAST("Corrected Energy" AS DOUBLE)         AS corrected_energy,
            TRY_CAST("Formation Energy Per Atom" AS DOUBLE) AS formation_energy_per_atom,
            TRY_CAST("Decomposition Energy Per Atom" AS DOUBLE) AS decomposition_energy_per_atom,
            "Dimensionality Cheon"             AS dimensionality,
            CASE
                WHEN "Bandgap" = 'inf'         THEN NULL
                WHEN "Bandgap" = ''            THEN NULL
                WHEN "Bandgap" IS NULL         THEN NULL
                ELSE TRY_CAST("Bandgap" AS DOUBLE)
            END                                AS bandgap,
            CASE
                WHEN "Bandgap" = 'inf'         THEN TRUE
                WHEN "Bandgap" = ''            THEN NULL
                WHEN "Bandgap" IS NULL         THEN NULL
                ELSE FALSE
            END                                AS is_metal,
            "Data Directory"                   AS data_directory
        FROM read_csv_auto('{SRC.as_posix()}', header=True, all_varchar=True, null_padding=True, strict_mode=False, quote='|');
    """)

    n = con.execute("SELECT COUNT(*) FROM materials").fetchone()[0]
    print(f"[2/3] 转换完成: {n} 行")

    # 写 Parquet (zstd 压缩)
    DST.parent.mkdir(parents=True, exist_ok=True)
    con.execute(f"""
        COPY (SELECT * FROM materials)
        TO '{DST.as_posix()}'
        (FORMAT PARQUET, COMPRESSION ZSTD, ROW_GROUP_SIZE 100000);
    """)

    size_mb = DST.stat().st_size / 1024 / 1024
    print(f"[3/3] 写出 Parquet: {DST} ({size_mb:.1f} MB)")

    # 抽样校验
    print("\n[校验] 抽样 3 行:")
    sample = con.execute("SELECT material_id, reduced_formula, elements, bandgap, is_metal, crystal_system FROM materials USING SAMPLE 3").fetchall()
    for row in sample:
        print("  ", row)
    return 0


if __name__ == "__main__":
    sys.exit(main())
