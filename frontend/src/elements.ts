// 元素周期表布局数据。
// group: 1-18 (CSS grid 列); period: 1-7 主表, 9 镧系, 10 锕系 (第 8 行留白作间隔)。
// available: 是否在 GNoME 数据集 (83 种元素) 中出现, false 则不可选。

export interface ElementInfo {
  symbol: string;
  name: string;
  group: number;
  period: number;
  available: boolean;
}

// [symbol, group, period, 中文名, available]
const RAW: [string, number, number, string, boolean][] = [
  ["H", 1, 1, "氢", true], ["He", 18, 1, "氦", false],
  ["Li", 1, 2, "锂", true], ["Be", 2, 2, "铍", true],
  ["B", 13, 2, "硼", true], ["C", 14, 2, "碳", true],
  ["N", 15, 2, "氮", true], ["O", 16, 2, "氧", true],
  ["F", 17, 2, "氟", true], ["Ne", 18, 2, "氖", false],
  ["Na", 1, 3, "钠", true], ["Mg", 2, 3, "镁", true],
  ["Al", 13, 3, "铝", true], ["Si", 14, 3, "硅", true],
  ["P", 15, 3, "磷", true], ["S", 16, 3, "硫", true],
  ["Cl", 17, 3, "氯", true], ["Ar", 18, 3, "氩", false],
  ["K", 1, 4, "钾", true], ["Ca", 2, 4, "钙", true],
  ["Sc", 3, 4, "钪", true], ["Ti", 4, 4, "钛", true],
  ["V", 5, 4, "钒", true], ["Cr", 6, 4, "铬", true],
  ["Mn", 7, 4, "锰", true], ["Fe", 8, 4, "铁", true],
  ["Co", 9, 4, "钴", true], ["Ni", 10, 4, "镍", true],
  ["Cu", 11, 4, "铜", true], ["Zn", 12, 4, "锌", true],
  ["Ga", 13, 4, "镓", true], ["Ge", 14, 4, "锗", true],
  ["As", 15, 4, "砷", true], ["Se", 16, 4, "硒", true],
  ["Br", 17, 4, "溴", true], ["Kr", 18, 4, "氪", false],
  ["Rb", 1, 5, "铷", true], ["Sr", 2, 5, "锶", true],
  ["Y", 3, 5, "钇", true], ["Zr", 4, 5, "锆", true],
  ["Nb", 5, 5, "铌", true], ["Mo", 6, 5, "钼", true],
  ["Tc", 7, 5, "锝", true], ["Ru", 8, 5, "钌", true],
  ["Rh", 9, 5, "铑", true], ["Pd", 10, 5, "钯", true],
  ["Ag", 11, 5, "银", true], ["Cd", 12, 5, "镉", true],
  ["In", 13, 5, "铟", true], ["Sn", 14, 5, "锡", true],
  ["Sb", 15, 5, "锑", true], ["Te", 16, 5, "碲", true],
  ["I", 17, 5, "碘", true], ["Xe", 18, 5, "氙", false],
  ["Cs", 1, 6, "铯", true], ["Ba", 2, 6, "钡", true],
  ["La", 3, 6, "镧", true], ["Hf", 4, 6, "铪", true],
  ["Ta", 5, 6, "钽", true], ["W", 6, 6, "钨", true],
  ["Re", 7, 6, "铼", true], ["Os", 8, 6, "锇", true],
  ["Ir", 9, 6, "铱", true], ["Pt", 10, 6, "铂", true],
  ["Au", 11, 6, "金", true], ["Hg", 12, 6, "汞", true],
  ["Tl", 13, 6, "铊", true], ["Pb", 14, 6, "铅", true],
  ["Bi", 15, 6, "铋", true], ["Po", 16, 6, "钋", false],
  ["At", 17, 6, "砹", false], ["Rn", 18, 6, "氡", false],
  ["Fr", 1, 7, "钫", false], ["Ra", 2, 7, "镭", false],
  ["Ac", 3, 7, "锕", true], ["Rf", 4, 7, "𬬻", false],
  ["Db", 5, 7, "𬭊", false], ["Sg", 6, 7, "𬭳", false],
  ["Bh", 7, 7, "𬭛", false], ["Hs", 8, 7, "𬭶", false],
  ["Mt", 9, 7, "鿏", false], ["Ds", 10, 7, "𫟼", false],
  ["Rg", 11, 7, "𬬭", false], ["Cn", 12, 7, "鿔", false],
  ["Nh", 13, 7, "鿭", false], ["Fl", 14, 7, "𫓧", false],
  ["Mc", 15, 7, "镆", false], ["Lv", 16, 7, "𫟷", false],
  ["Ts", 17, 7, "鿬", false], ["Og", 18, 7, "鿫", false],
  // 镧系 (period 9)
  ["Ce", 4, 9, "铈", true], ["Pr", 5, 9, "镨", true],
  ["Nd", 6, 9, "钕", true], ["Pm", 7, 9, "钷", true],
  ["Sm", 8, 9, "钐", true], ["Eu", 9, 9, "铕", true],
  ["Gd", 10, 9, "钆", true], ["Tb", 11, 9, "铽", true],
  ["Dy", 12, 9, "镝", true], ["Ho", 13, 9, "钬", true],
  ["Er", 14, 9, "铒", true], ["Tm", 15, 9, "铥", true],
  ["Yb", 16, 9, "镱", true], ["Lu", 17, 9, "镥", true],
  // 锕系 (period 10)
  ["Th", 4, 10, "钍", true], ["Pa", 5, 10, "镤", true],
  ["U", 6, 10, "铀", true], ["Np", 7, 10, "镎", true],
  ["Pu", 8, 10, "钚", true], ["Am", 9, 10, "镅", false],
  ["Cm", 10, 10, "锔", false], ["Bk", 11, 10, "锫", false],
  ["Cf", 12, 10, "锎", false], ["Es", 13, 10, "锿", false],
  ["Fm", 14, 10, "镄", false], ["Md", 15, 10, "钔", false],
  ["No", 16, 10, "锘", false], ["Lr", 17, 10, "镥", false],
];

export const ELEMENTS: ElementInfo[] = RAW.map(
  ([symbol, group, period, name, available]) => ({
    symbol,
    group,
    period,
    name,
    available,
  }),
);

export const ELEMENT_MAP: Record<string, ElementInfo> = Object.fromEntries(
  ELEMENTS.map((e) => [e.symbol, e]),
);

// 稀土元素 (含 Y/Sc), 用于"含任一稀土"预设。
export const RARE_EARTH = [
  "Sc", "Y", "La", "Ce", "Pr", "Nd", "Pm", "Sm", "Eu", "Gd",
  "Tb", "Dy", "Ho", "Er", "Tm", "Yb", "Lu",
];
