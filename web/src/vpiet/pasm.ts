/**
 * 文字列 → PASM（Piet のアセンブリ）の命令列。Web 版で足したもの（vpiet は命令列を手で書いていた）。
 * 探索では push n に n コーデルのブロックが要るので、小さい数（1〜3）の push と dup・mul・add・sub で数を作る。
 * 1 文字目はそのまま作り、2 文字目からは「前の文字を dup で残しておき、差を足す／引く」か「pop して作り直す」の安い方。
 */
import { Order } from "./piet";

export interface PasmOrder {
  order: Order;
  /** push のときの数 */
  arg?: number;
}

const NAME_TO_ORDER: Record<string, Order> = {
  push: Order.Push,
  pop: Order.Pop,
  add: Order.Add,
  sub: Order.Sub,
  mul: Order.Mul,
  div: Order.Div,
  mod: Order.Mod,
  not: Order.Not,
  greater: Order.Greater,
  dup: Order.Dup,
  roll: Order.Roll,
  outn: Order.OutN,
  outc: Order.OutC,
  inn: Order.InN,
  inc: Order.InC,
  terminate: Order.Terminate,
  end: Order.Terminate,
};

export function formatPasm(orders: PasmOrder[]): string {
  const name = Object.fromEntries(Object.entries(NAME_TO_ORDER).map(([k, v]) => [v, k]));
  return orders.map((o) => (o.order === Order.Push ? `push ${o.arg}` : name[o.order])).join("\n");
}

export function parsePasm(text: string): PasmOrder[] {
  const out: PasmOrder[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.split("#")[0].trim();
    if (!line) continue;
    const [op, arg] = line.split(/\s+/);
    const order = NAME_TO_ORDER[op.toLowerCase()];
    if (order === undefined) throw new Error(`知らない命令: ${line}`);
    if (order === Order.Push) {
      const n = Number(arg);
      if (!Number.isInteger(n) || n < 1) throw new Error(`push の数が正しくない: ${line}`);
      out.push({ order, arg: n });
    } else out.push({ order });
  }
  if (!out.length || out[out.length - 1].order !== Order.Terminate) out.push({ order: Order.Terminate });
  return out;
}

// ---- 数を作る式（コスト = push n は n、ほかの命令は 1） ----
type Expr = { kind: "push"; n: number } | { kind: "sq"; a: number } | { kind: "dbl"; a: number } | { kind: "bin"; op: Order; a: number; b: number };

const SMALL_MAX = 2048;
const PUSH_MAX = 3;
let table: { cost: Int32Array; expr: Expr[] } | null = null;

function buildTable() {
  const cost = new Int32Array(SMALL_MAX + 1).fill(1 << 29);
  const expr: Expr[] = new Array(SMALL_MAX + 1);
  for (let n = 1; n <= PUSH_MAX; n++) {
    cost[n] = n;
    expr[n] = { kind: "push", n };
  }
  // 0 = push 1, dup, sub
  const set = (n: number, c: number, e: Expr) => {
    if (n < 0 || n > SMALL_MAX || c >= cost[n]) return false;
    cost[n] = c;
    expr[n] = e;
    return true;
  };
  set(0, 3, { kind: "bin", op: Order.Sub, a: 1, b: 1 });
  for (let changed = true; changed; ) {
    changed = false;
    for (let a = 1; a <= SMALL_MAX; a++) {
      const ca = cost[a];
      if (ca >= 1 << 29) continue;
      changed = set(a * a, ca + 2, { kind: "sq", a }) || changed;
      changed = set(a + a, ca + 2, { kind: "dbl", a }) || changed;
      for (let b = 1; b <= a; b++) {
        const c = ca + cost[b] + 1;
        changed = set(a + b, c, { kind: "bin", op: Order.Add, a, b }) || changed;
        changed = set(a - b, c, { kind: "bin", op: Order.Sub, a, b }) || changed;
        if (a * b <= SMALL_MAX) changed = set(a * b, c, { kind: "bin", op: Order.Mul, a, b }) || changed;
      }
    }
  }
  return { cost, expr };
}

/** n（0 以上）をスタックに積む命令列 */
export function numberOrders(n: number): PasmOrder[] {
  if (n < 0) throw new RangeError("負の数");
  table ??= buildTable();
  const t = table;
  if (n <= SMALL_MAX) {
    const e = t.expr[n];
    switch (e.kind) {
      case "push":
        return [{ order: Order.Push, arg: e.n }];
      case "sq":
        return [...numberOrders(e.a), { order: Order.Dup }, { order: Order.Mul }];
      case "dbl":
        return [...numberOrders(e.a), { order: Order.Dup }, { order: Order.Add }];
      case "bin":
        if (e.op === Order.Sub && e.a === e.b) return [...numberOrders(e.a), { order: Order.Dup }, { order: Order.Sub }];
        return [...numberOrders(e.a), ...numberOrders(e.b), { order: e.op }];
    }
  }
  // 大きい数: n = q × m + r（m は 2〜64 で命令がいちばん短いもの）
  let best: PasmOrder[] | null = null;
  for (let m = 2; m <= 64; m++) {
    const q = Math.floor(n / m);
    const r = n % m;
    const o = [...numberOrders(q), ...numberOrders(m), { order: Order.Mul }];
    if (r) o.push(...numberOrders(r), { order: Order.Add });
    if (!best || pasmCost(o) < pasmCost(best)) best = o;
  }
  return best!;
}

export const pasmCost = (orders: PasmOrder[]) => orders.reduce((s, o) => s + (o.order === Order.Push ? o.arg! : 1), 0);

/** 文字列を出力して終わる命令列 */
export function stringToPasm(text: string): PasmOrder[] {
  const codes = [...text].map((c) => c.codePointAt(0)!);
  const out: PasmOrder[] = [];
  let prev: number | null = null;
  codes.forEach((c, i) => {
    let part: PasmOrder[];
    if (prev === null) part = numberOrders(c);
    else {
      const d = c - prev;
      const viaDelta: PasmOrder[] = d === 0 ? [] : [...numberOrders(Math.abs(d)), { order: d > 0 ? Order.Add : Order.Sub }];
      const fresh: PasmOrder[] = [{ order: Order.Pop }, ...numberOrders(c)];
      part = pasmCost(viaDelta) <= pasmCost(fresh) ? viaDelta : fresh;
    }
    out.push(...part);
    // 次の文字のために dup で残す（最後の文字は残さない）
    if (i < codes.length - 1) out.push({ order: Order.Dup });
    out.push({ order: Order.OutC });
    prev = c;
  });
  out.push({ order: Order.Terminate });
  return out;
}
