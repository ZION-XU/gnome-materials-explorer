# GNoME Materials Explorer

> 基于 Google DeepMind GNoME 数据集（554,219 条 AI 发现的稳定无机材料）的本地材料筛选桌面应用。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## 这是什么

2023 年 Google DeepMind 在 Nature 发表 GNoME，用 AI 发现了 **38 万余种**新颖稳定材料，将人类已知的稳定晶体材料数量扩展了近一倍。然而官方仅以一个 151MB 的 CSV 文件 + 云端结构文件桶形式发布，**没有任何可用的浏览、筛选、可视化界面**——绝大多数材料研究者根本不会去解析这么大的 CSV。

本产品填补这个空缺：把数据预处理为列式 Parquet，提供**元素周期表交互筛选、带隙/稳定性/密度多维过滤、应用导向预设、结果导出**，全部本地运行，无需联网，数据不离开本机。

## 功能特性

- 🧪 **元素周期表交互筛选** — 完整 118 格周期表，支持「必须包含 / 含任一 / 排除」三种模式
- 📊 **多维数值过滤** — 带隙、分解能、形成能、密度范围
- 🎯 **6 个应用预设** — 钠/锂离子电池候选、光伏光催化半导体、稀土功能材料、宽禁带绝缘体、金属导体
- 🏷️ **结构分类** — 晶系（7 类）、维度（3D/2D/1D/0D/插层）多选
- 📈 **全量概览** — 顶栏带隙分布条形图、晶系/维度统计
- 💾 **导出** — 查询结果或单条材料导出为 CSV / JSON
- 🔒 **本地优先** — 数据全在本地，DuckDB 进程内查询，毫秒级响应，无需后端服务

## 截图

> 顶栏：554,219 条材料的带隙分布概览
> 左侧：周期表 + 筛选面板　中间：结果表　右侧：材料详情

## 快速开始

### 环境要求

- [Node.js](https://nodejs.org/) 20+ 与 pnpm
- [Rust](https://www.rust-lang.org/) 1.77+（含 `tauri-cli`）
- Python 3.10+ + `duckdb`（仅数据预处理需要）
- Windows / macOS / Linux 桌面环境

### 1. 获取数据并预处理

GNoME 原始数据为 `stable_materials_summary.csv`（约 151MB），请从 GNoME 官方发布获取，放入 `data/gnome/` 目录。

```bash
pip install duckdb
python scripts/preprocess.py
# 生成 data/gnome/materials.parquet（约 30MB，列式压缩）
```

### 2. 安装与运行

```bash
cd frontend
pnpm install
pnpm tauri dev
```

> 首次启动时 Rust 会编译内置的 DuckDB（约 5–10 分钟），之后增量编译秒级。

### 3. 生产打包

```bash
cd frontend
pnpm tauri build
# 产物位于 frontend/src-tauri/target/release/bundle/
```

## 技术架构

本地优先 B/S：**Tauri 壳（Rust 核心）+ WebView 前端**，数据全在本地。

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

| 层 | 技术 |
|---|---|
| 数据层 | DuckDB（in-memory，VIEW 挂载 Parquet） |
| 核心层 | Rust + `duckdb` crate（bundled） |
| 前端 | React 19 + Vite 8 + TypeScript，自写深色样式 |

**安全**：元素符号、晶系、维度等离散值经 Rust 端白名单校验后内联 SQL；数值用绑定参数，避免注入。

详细的接口定义、字段说明、构建细节见 [DEVELOPMENT.md](DEVELOPMENT.md)。

## 应用预设说明

| 预设 | 条件 | 典型用途 |
|---|---|---|
| 钠离子电池候选 | 含 Na · 分解能 ≤ 0.1 eV | 钠离子电池正负极筛选 |
| 锂离子电池候选 | 含 Li · 分解能 ≤ 0.1 eV | 锂离子电池材料 |
| 光伏/光催化半导体 | 带隙 1.5–3.0 eV · 非金属 · 稳定 | 太阳能电池、光解水 |
| 稀土功能材料 | 含任一稀土 · 稳定 | 荧光粉、永磁、催化 |
| 宽禁带绝缘体 | 带隙 3–6 eV · 非金属 | 介质、窗口层 |
| 金属导体 | 带隙为 0（金属） | 电极、导电材料 |

> `分解能 ≤ 0.1 eV/atom` 是「距凸包足够近、可能可合成」的经验阈值。

## 已知限制

- **暂无 3D 晶体结构渲染**：原始数据中结构文件存储于云端（GCS 路径），本地无 CIF 文件。下一版将支持按需下载并渲染。
- **导出范围**：仅导出当前查询返回的行（上限 1000）。
- 带隙下限筛选会排除金属；筛金属请用「金属导体」预设。

## 路线图

- [x] MVP：数据预处理 + 周期表筛选 + 结果表 + 导出
- [ ] 3D 晶体结构按需下载与渲染（Three.js）
- [ ] 导出 VASP / Quantum ESPRESSO 输入文件模板
- [ ] 相对 Materials Project / OQMD 的新颖度标注
- [ ] 地壳丰度 / 毒性白名单过滤

## 数据来源

- **GNoME** — Merchant et al., *Scaling deep learning for materials discovery*, Nature 624, 80–85 (2023). [DOI:10.1038/s41586-023-06735-w](https://doi.org/10.1038/s41586-023-06735-w)
- 本应用仅对公开发布的 `stable_materials_summary.csv` 做格式转换与界面呈现，不修改原始科学数据。

## 许可证

[MIT License](LICENSE) — 完全开源，自由使用、修改、分发。

GNoME 数据集本身的许可以其官方发布为准。
