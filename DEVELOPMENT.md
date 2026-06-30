# GNoME Materials Explorer — 开发文档

基于 Google DeepMind GNoME 数据集（554,219 条 AI 发现的稳定无机材料）的本地材料筛选桌面应用。

填补的空缺：GNoME 原始数据仅以 151MB CSV + GCS 结构桶形式发布，没有任何可用的浏览/筛选/可视化层。本应用把数据预处理为列式 Parquet，提供元素周期表筛选、带隙/稳定性/密度多维过滤、应用预设、结果导出，全部在本地运行。

## 架构

本地优先 B/S：Tauri 壳（Rust 核心）+ WebView 前端，数据全在本地，无需联网或后端服务。

```
┌─────────────────────────────────────────────┐
│  Tauri 窗口 (WebView)                        │
│  ┌───────────────┐  ┌──────────────────┐    │
│  │ React 前端     │  │ Rust 核心层       │    │
│  │  周期表/筛选    │←─invoke→│ DuckDB (in-mem)  │    │
│  │  结果表/详情    │  │  VIEW on Parquet │    │
│  └───────────────┘  └──────────────────┘    │
└─────────────────────────────────────────────┘
        │
   data/gnome/materials.parquet (30 MB)
```

- **数据层**：DuckDB 在进程内打开 in-memory DB，以 `VIEW` 挂载 Parquet 文件。55 万行筛选毫秒级。
- **核心层**：Rust（`src-tauri/src/lib.rs`），暴露 4 个 Tauri command。
- **前端**：React 19 + Vite 8 + TypeScript，无 UI 框架，自写深色样式。

## 目录结构

```
20260629-GNoME/
├── data/gnome/
│   ├── stable_materials_summary.csv   # 原始数据 (151 MB, 不入库)
│   └── materials.parquet              # 预处理后产物 (30 MB)
├── scripts/
│   └── preprocess.py                  # CSV → Parquet
├── frontend/
│   ├── src/
│   │   ├── App.tsx                    # 顶层状态 + 查询 + 导出
│   │   ├── types.ts                   # Filter / MaterialRow / Stats 类型
│   │   ├── api.ts                     # invoke 封装
│   │   ├── elements.ts                # 周期表布局数据 (118 元素)
│   │   ├── presets.ts                 # 6 个应用预设
│   │   ├── styles.css                 # 深色科技风样式
│   │   └── components/
│   │       ├── PeriodicTable.tsx
│   │       ├── FilterPanel.tsx
│   │       ├── ResultTable.tsx
│   │       ├── DetailPanel.tsx
│   │       └── StatsBar.tsx
│   ├── src-tauri/
│   │   ├── Cargo.toml                 # 含 duckdb (bundled) 依赖
│   │   ├── tauri.conf.json
│   │   └── src/lib.rs                 # DuckDB 查询核心层
│   └── package.json
└── DEVELOPMENT.md
```

## 数据说明

`scripts/preprocess.py` 把 CSV 转成 Parquet，关键字段清洗：

| 原字段 | 处理 |
|---|---|
| Elements `"['S','Zr']"` | 解析为 `LIST<VARCHAR>`，支持 `list_has_all` / `list_has_any` 筛选 |
| Bandgap `inf` | → `NULL`，`is_metal=TRUE`（金属） |
| Bandgap `''` | → `NULL`，`is_metal=NULL`（未知） |
| 数值字段 | `TRY_CAST`，非法值 → `NULL` |

预处理要点（踩过的坑）：
- `read_csv` 默认把 Elements 字段的双引号当 quote 符，在逗号处截断 → 用 `quote='|'` 禁用双引号引用。
- 某些行列数不足 → `null_padding=True` 补 NULL，不丢数据。

Parquet schema 列：`material_id, composition, reduced_formula, elements, n_sites, volume, density, point_group, space_group, space_group_number, crystal_system, corrected_energy, formation_energy_per_atom, decomposition_energy_per_atom, dimensionality, bandgap, is_metal, data_directory`

## 前后端接口（Tauri command）

| Command | 入参 | 返回 | 说明 |
|---|---|---|---|
| `query_materials` | `filter: Filter` | `MaterialRow[]` | 分页查询，limit ≤ 1000 |
| `count_materials` | `filter: Filter` | `i64` | 同条件总数（不受 limit 影响） |
| `get_material` | `materialId: string` | `MaterialRow \| null` | 单条详情 |
| `stats` | — | `Stats` | 全量概览：带隙分布、晶系/维度分布 |

**Filter 字段**（camelCase）：
`includeElements`（必须全部包含）、`includeAnyElements`（含任一）、`excludeElements`（排除）、`bandgapMin/Max`、`isMetal`、`decompMax`、`formationMax`、`densityMin/Max`、`crystalSystems`、`dimensionalities`、`limit`、`offset`

**安全**：元素符号、晶系、维度等离散值经 Rust 端白名单校验后内联 SQL；数值用 `?` 绑定参数，避免注入。

## 构建与运行

### 环境要求
- Node 20+ / pnpm
- Rust 1.77+（带 `tauri-cli`）
- Python 3.10+ + `duckdb`（仅预处理需要）

### 1. 数据预处理（首次）
```bash
pip install duckdb
python scripts/preprocess.py
# 生成 data/gnome/materials.parquet
```

### 2. 开发模式
```bash
cd frontend
pnpm install
pnpm tauri dev
```
> Rust 首次编译会构建 bundled DuckDB（约 5–10 分钟），之后增量编译秒级。

### 3. 生产打包
```bash
cd frontend
pnpm tauri build
# 产物在 frontend/src-tauri/target/release/bundle/
```

### 数据路径
应用按以下顺序查找 `materials.parquet`：
1. 环境变量 `GNOME_PARQUET`
2. `data/gnome/materials.parquet`（相对工作目录）
3. `../data/gnome/materials.parquet`
4. `../../data/gnome/materials.parquet`

## 应用预设

| 预设 | 条件 |
|---|---|
| 钠离子电池候选 | 含 Na · 分解能 ≤ 0.1 eV |
| 锂离子电池候选 | 含 Li · 分解能 ≤ 0.1 eV |
| 光伏/光催化半导体 | 带隙 1.5–3.0 eV · 非金属 · 稳定 |
| 稀土功能材料 | 含任一稀土 · 稳定 |
| 宽禁带绝缘体 | 带隙 3–6 eV · 非金属 |
| 金属导体 | 带隙为 0（金属） |

> `decompMax = 0.1 eV/atom` 是"距凸包足够近、可能可合成"的经验阈值。

## 已知限制（MVP）

1. **无 3D 晶体结构渲染**：CSV 中 `Data Directory` 是 GCS 路径（`gs://crystal-design/...`），本地无 CIF 文件。详情面板仅显示结构路径。3D 渲染需额外下载结构文件（v2）。
2. **导出范围**：仅导出当前查询返回的行（limit ≤ 1000），不是全量结果集。
3. **元素选择**：一个元素不能同时处于"包含/任一/排除"多个列表（互斥）。
4. **带隙筛选**：`bandgapMin` 会排除金属（`bandgap IS NULL`）。筛金属用"金属导体"预设或 `isMetal=true`。

## 后续路线

- **v1.1**：3D 晶体结构渲染（Three.js），支持从 GNoME HuggingFace 仓库按需下载 CIF。
- **v1.2**：导出 VASP / Quantum ESPRESSO 输入文件模板。
- **v1.3**：相对 MP/OQMD 的新颖度标注（数据已含 `Decomposition Energy Per Atom MP/OQMD` 对照列，预处理时可保留）。
- **v2**：地壳丰度/毒性白名单过滤、用户保存的筛选画像、批量结构下载。
