/**
 * Piet の色と命令（github.com/Muratam/vpiet の packages/projects/pietbase を移したもの）。
 * 色の番号: 0〜17 が有彩色（色相 6 × 明るさ 3。番号 = 明るさ × 6 + 色相。明るさ 0 が明るい・1 が普通・2 が暗い）、18 が白、19 が黒。
 */
export type PietColor = number;

export const HUE_MAX = 6;
export const LIGHT_MAX = 3;
export const CHROM_MAX = HUE_MAX * LIGHT_MAX; // 18
export const WHITE = CHROM_MAX; // 18
export const BLACK = WHITE + 1; // 19
export const MAX_COLOR = BLACK;

export enum Order {
  ErrorOrder,
  Push,
  Pop,
  Add,
  Sub,
  Mul,
  Div,
  Mod,
  Not,
  Greater,
  Pointer,
  Switch,
  Dup,
  Roll,
  InN,
  InC,
  OutN,
  OutC,
  Wall,
  Nop,
  Terminate,
}

/** 色相の差 × 明るさの差 → 命令 */
export const ORDER_BLOCK: Order[][] = [
  [Order.ErrorOrder, Order.Push, Order.Pop],
  [Order.Add, Order.Sub, Order.Mul],
  [Order.Div, Order.Mod, Order.Not],
  [Order.Greater, Order.Pointer, Order.Switch],
  [Order.Dup, Order.Roll, Order.InN],
  [Order.InC, Order.OutN, Order.OutC],
];

export const ORDER_NAMES: Record<number, string> = {
  [Order.Push]: "push",
  [Order.Pop]: "pop",
  [Order.Add]: "add",
  [Order.Sub]: "sub",
  [Order.Mul]: "mul",
  [Order.Div]: "div",
  [Order.Mod]: "mod",
  [Order.Not]: "not",
  [Order.Greater]: "greater",
  [Order.Pointer]: "pointer",
  [Order.Switch]: "switch",
  [Order.Dup]: "dup",
  [Order.Roll]: "roll",
  [Order.InN]: "inn",
  [Order.InC]: "inc",
  [Order.OutN]: "outn",
  [Order.OutC]: "outc",
  [Order.Terminate]: "terminate",
};

export const hue = (c: PietColor) => c % HUE_MAX;
export const light = (c: PietColor) => Math.floor(c / HUE_MAX);

/** 番号 → RGB（0xRRGGBB） */
export function pietRgb(c: PietColor): number {
  if (c === WHITE) return 0xffffff;
  if (c === BLACK) return 0x000000;
  const l = light(c) === 0 ? 0xc0 : 0x00;
  const h = light(c) === 2 ? 0xc0 : 0xff;
  const t: [number, number, number][] = [
    [h, l, l],
    [h, h, l],
    [l, h, l],
    [l, h, h],
    [l, l, h],
    [h, l, h],
  ];
  const [r, g, b] = t[hue(c)];
  return (r << 16) | (g << 8) | b;
}

const RGB_TO_PIET = new Map<number, PietColor>();
for (let c = 0; c <= MAX_COLOR; c++) RGB_TO_PIET.set(pietRgb(c), c);

/** RGB がちょうど Piet の 20 色のどれかなら、その番号。違えば -1 */
export function exactPietColor(rgb: number): PietColor {
  return RGB_TO_PIET.get(rgb) ?? -1;
}

/** 今の色から次の色に移ったときの命令（vpiet の decideOrder） */
export function decideOrder(now: PietColor, next: PietColor): Order {
  if (now < 0 || next < 0) return Order.ErrorOrder;
  if (next === BLACK || now === BLACK) return Order.Wall;
  if (next === WHITE || now === WHITE) return Order.Nop;
  const hueDiff = (HUE_MAX + ((hue(next) - hue(now)) % HUE_MAX)) % HUE_MAX;
  const lightDiff = (LIGHT_MAX + ((light(next) - light(now)) % LIGHT_MAX)) % LIGHT_MAX;
  return ORDER_BLOCK[hueDiff][lightDiff];
}

/** 今の色からその命令になる次の色（vpiet の searchNextPietColor） */
export function nextColor(now: PietColor, order: Order): PietColor {
  if (order === Order.Nop) return WHITE;
  for (let h = 0; h < ORDER_BLOCK.length; h++) {
    for (let l = 0; l < ORDER_BLOCK[h].length; l++) {
      if (ORDER_BLOCK[h][l] !== order) continue;
      return ((light(now) + l) % LIGHT_MAX) * HUE_MAX + ((hue(now) + h) % HUE_MAX);
    }
  }
  throw new Error(`色が決まらない: ${now} ${order}`);
}

const NEXT_TABLE: number[][] = Array.from({ length: CHROM_MAX }, (_, c) =>
  Array.from({ length: Order.Terminate + 1 }, (_, o) => {
    try {
      return nextColor(c, o);
    } catch {
      return -1;
    }
  }),
);
export const getNextColor = (c: PietColor, o: Order) => NEXT_TABLE[c][o];

// ---- 向き（DP と CC） ----
/** DP: 0 右・1 下・2 左・3 上（時計回り） */
export type DP = 0 | 1 | 2 | 3;
/** CC: 0 右（false）・1 左（true） */
export type CC = 0 | 1;
export const DP_RIGHT: DP = 0;
export const CC_LEFT: CC = 1;
export const DXDY: [number, number][] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];
export const toggleCC = (cc: CC): CC => (cc ^ 1) as CC;
export const toggleDP = (dp: DP, n = 1): DP => ((((dp + n) % 4) + 4) % 4) as DP;
/** EightDirection の添え字: dp × 2 + cc */
export const dir8 = (cc: CC, dp: DP) => dp * 2 + cc;
/** vpiet の allCCDP の順（(左,右)(右,右)(左,下)…） */
export const ALL_CCDP: [CC, DP][] = [
  [1, 0],
  [0, 0],
  [1, 1],
  [0, 1],
  [1, 2],
  [0, 2],
  [1, 3],
  [0, 3],
];
