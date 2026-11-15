/**
 * VPiet の埋め込み: 元のドット絵（Piet の 20 色に寄せたもの）をなるべく保ったまま、命令列を実行する Piet の画像を作る。
 * github.com/Muratam/vpiet の packages/projects/stegano（stego.nim・node.nim・target.nim・blockinfo.nim）を移したもの。
 *
 * 最良優先のビームサーチ: 状態は「どこまで色を決めたか（未定は null）・今のコーデル・DP/CC・余剰のスタック（fund）・元の画像との色差の合計」。
 * 1 回の反復で、各状態から「ブロックを 1 コーデル伸ばす」「次の命令を実行する色を置く」「黒を置く」「白を置く」「余剰の命令を実行する」を試し、
 * [命令の番号][余剰の深さ] ごとに色差の小さい上位だけを残す。全部の命令を終えたら、未定の所を元の色（だめなら近い色）で埋める。
 * 同じ状態の数え方・同点の扱い・ヒープの順まで元と同じにしている（重複の判定に使うハッシュの関数だけは違う）。
 */
import { ALL_CCDP, BLACK, CC_LEFT, CHROM_MAX, DP_RIGHT, DXDY, getNextColor, Order, toggleCC, toggleDP, WHITE, dir8, type CC, type DP, type PietColor } from "./piet";
import { DISTANCE } from "./distance";
import type { PasmOrder } from "./pasm";

const EPS = 1e12;
/** vpiet の dxdys（伸ばす向きの順） */
const DXDYS: [number, number][] = [
  [0, 1],
  [0, -1],
  [1, 0],
  [-1, 0],
];
// EightDirection の各成分の添え字（dir8 = dp × 2 + cc。cc 右 = 0、左 = 1）
const RIGHT_R = 0, RIGHT_L = 1, DOWN_R = 2, DOWN_L = 3, LEFT_R = 4, LEFT_L = 5, UP_R = 6, UP_L = 7;

class BlockInfo {
  used: boolean[];
  px: number[];
  py: number[];
  color: PietColor;
  sameBlocks: number[];
  sizeFix: boolean;
  constructor(color: PietColor, x: number, y: number, index: number) {
    this.used = [false, false, false, false, false, false, false, false];
    this.px = [x, x, x, x, x, x, x, x];
    this.py = [y, y, y, y, y, y, y, y];
    this.color = color;
    this.sameBlocks = [index];
    this.sizeFix = false;
  }
  copy(): BlockInfo {
    const b = Object.create(BlockInfo.prototype) as BlockInfo;
    b.used = this.used.slice();
    b.px = this.px.slice();
    b.py = this.py.slice();
    b.color = this.color;
    b.sameBlocks = this.sameBlocks.slice();
    b.sizeFix = this.sizeFix;
    return b;
  }
}
const whiteBlockInfo = new BlockInfo(WHITE, -1, -1, -1);
const blackBlockInfo = new BlockInfo(BLACK, -1, -1, -1);

type Mat = (BlockInfo | null)[];

interface Node {
  val: number;
  x: number;
  y: number;
  mat: Mat;
  dp: DP;
  cc: CC;
  fund: number[];
}

/** vpiet の BinaryHeap（compare(x, y) <= 0 なら x が上。pop は遅延して次の操作で行う）をそのまま */
class BinaryHeap {
  nodes: Node[] = [];
  popchunk = false;
  // compare = y.val - x.val（値の大きい＝悪いものが上）
  private cmp(a: Node, b: Node) {
    return b.val - a.val;
  }
  len() {
    return this.nodes.length - (this.popchunk ? 1 : 0);
  }
  private shiftdown() {
    this.popchunk = false;
    const n = this.nodes;
    const size = n.length;
    let i = 0;
    for (;;) {
      const L = i * 2 + 1;
      const R = i * 2 + 2;
      if (L >= size) break;
      const child = R < size && this.cmp(n[R], n[L]) <= 0 ? R : L;
      if (this.cmp(n[i], n[child]) <= 0) break;
      const t = n[i];
      n[i] = n[child];
      n[child] = t;
      i = child;
    }
  }
  private pushimpl(node: Node) {
    const n = this.nodes;
    n.push(node);
    let i = n.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.cmp(n[parent], node) <= 0) break;
      n[i] = n[parent];
      i = parent;
    }
    n[i] = node;
  }
  private popimpl(): Node {
    const n = this.nodes;
    const r = n[0];
    n[0] = n[n.length - 1];
    n.length -= 1;
    this.shiftdown();
    return r;
  }
  items(): Node[] {
    if (this.popchunk) this.popimpl();
    return this.nodes;
  }
  top(): Node {
    if (this.popchunk) this.popimpl();
    return this.nodes[0];
  }
  push(node: Node) {
    if (this.popchunk) {
      this.nodes[0] = node;
      this.shiftdown();
    } else this.pushimpl(node);
  }
  pop(): Node {
    if (this.popchunk) this.popimpl();
    this.popchunk = true;
    return this.nodes[0];
  }
}

export interface SearchParams {
  maxFrontierNum: number;
  maxFundLevel: number;
  maxTrackBackOrderLen: number;
  /**
   * 元の vpiet の push の扱いを直す（既定 true）。元は余剰の push で「入った先のブロックの大きさ」を積むとみなし、
   * また入った先がもう決まっているときは出たブロックの大きさを固定しなかった。Piet では push は「出たブロックの大きさ」なので、
   * そのままだと実行したときに余剰のスタックの値がずれ、pointer・switch の向きが変わって別の出力になることがある。
   * false にすると元とビット単位で同じ結果になる（golden の照合用）。
   */
  fixPush: boolean;
  /**
   * 最後の命令（終了）まで来た候補を、余剰のスタックが残っているものからも選ぶ（既定 true）。
   * 元は余剰が空のものだけから選ぶので、終了まで来ていても「見つからない」で止まることがあった。終了した後のスタックは出力に影響しない。
   * false にすると元と同じ（golden の照合用）。
   */
  anyFundAtEnd: boolean;
}
export const DEFAULT_PARAMS: SearchParams = { maxFrontierNum: 720, maxFundLevel: 6, maxTrackBackOrderLen: 30, fixPush: true, anyFundAtEnd: true };

export interface SearchProgress {
  iteration: number;
  /** いちばん進んだ命令の番号 */
  reached: number;
  orders: number;
}

class Env {
  w: number;
  h: number;
  img: Int8Array;
  orders: PasmOrder[];
  p: SearchParams;
  fronts: Node[][][];
  nexts: BinaryHeap[][] = [];
  stored: Set<number>[][] = [];
  maxNonNilFrontIndex = 0;
  maxFunds: number[] = [];
  completedMin = EPS;

  constructor(img: Int8Array, w: number, h: number, orders: PasmOrder[], p: SearchParams) {
    this.img = img;
    this.w = w;
    this.h = h;
    this.orders = orders;
    this.p = p;
    this.fronts = Array.from({ length: orders.length + 1 }, () => Array.from({ length: p.maxFundLevel }, () => []));
    for (let c = 0; c < CHROM_MAX; c++) {
      const mat: Mat = new Array(w * h).fill(null);
      const v = { val: 0 };
      if (!this.updateMatVal(0, 0, c, mat, v)) throw new Error("初期化に失敗");
      this.fronts[0][0].push({ val: v.val, x: 0, y: 0, mat, dp: DP_RIGHT, cc: CC_LEFT, fund: [] });
    }
  }

  isIn(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }
  dist(color: PietColor, x: number, y: number) {
    return DISTANCE[color][this.img[x + y * this.w]];
  }

  // ---- 1 コーデルの更新（node.nim の update） ----
  updateMat(x: number, y: number, color: PietColor, mat: Mat): boolean {
    const w = this.w;
    if (mat[x + y * w] !== null) throw new Error("更新する所が空いていない");
    if (color === WHITE) {
      mat[x + y * w] = whiteBlockInfo;
      return true;
    }
    if (color === BLACK) {
      mat[x + y * w] = blackBlockInfo;
      return true;
    }
    const adjasts = this.checkAdjasts(mat, x, y, color);
    if (adjasts.length === 0) {
      mat[x + y * w] = new BlockInfo(color, x, y, x + w * y);
      return true;
    }
    for (const a of adjasts) if (a.sizeFix) return false;
    const zero = adjasts[0].copy();
    zero.sameBlocks.push(x + w * y);
    if (!canUpdateEndPos(zero, x, y)) return false;
    for (let l = 1; l < adjasts.length; l++) {
      const nb = adjasts[l].copy();
      for (const b of zero.sameBlocks) if (!canUpdateEndPos(nb, b % w, Math.floor(b / w))) return false;
      for (const b of nb.sameBlocks) if (!canUpdateEndPos(zero, b % w, Math.floor(b / w))) return false;
      for (const [cc, dp] of ALL_CCDP) {
        const d = dir8(cc, dp);
        zero.used[d] = zero.used[d] || nb.used[d];
      }
      zero.sameBlocks.push(...nb.sameBlocks);
    }
    for (const i of zero.sameBlocks) mat[i] = zero;
    return true;
  }
  updateMatVal(x: number, y: number, color: PietColor, mat: Mat, v: { val: number }): boolean {
    v.val += this.dist(color, x, y);
    return this.updateMat(x, y, color, mat);
  }

  checkAdjasts(mat: Mat, x: number, y: number, color: PietColor): BlockInfo[] {
    const res: BlockInfo[] = [];
    for (const [dx, dy] of DXDYS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!this.isIn(nx, ny)) continue;
      const b = mat[nx + ny * this.w];
      if (b === null || b.color !== color || res.includes(b)) continue;
      res.push(b);
    }
    return res;
  }

  // ---- 反復ごとの準備（node.nim） ----
  prepare() {
    const L = this.orders.length + 1;
    this.nexts = Array.from({ length: L }, () => Array.from({ length: this.p.maxFundLevel }, () => new BinaryHeap()));
    this.stored = Array.from({ length: L }, () => Array.from({ length: this.p.maxFundLevel }, () => new Set<number>()));
    let m = -Infinity;
    for (let i = 0; i < this.fronts.length; i++) if (this.fronts[i].some((f) => f.length > 0)) m = i;
    this.maxNonNilFrontIndex = m;
    this.maxFunds = Array.from({ length: this.p.maxFundLevel }, (_, i) => Math.trunc(this.p.maxFrontierNum / (1 + 4 * i)));
  }
  getMaxFunds(fund: number, ord: number) {
    const tb = (ord - this.maxNonNilFrontIndex + this.p.maxTrackBackOrderLen) / this.p.maxTrackBackOrderLen;
    return Math.trunc(this.maxFunds[fund] * Math.max(1.0, tb));
  }
  getStoredWorstVal(fund: number, ord: number) {
    if (fund >= this.p.maxFundLevel) return -1;
    const heap = this.nexts[ord][fund];
    if (heap.len() < this.getMaxFunds(fund, ord)) return Math.min(EPS, this.completedMin);
    if (heap.len() === 0) return Math.min(EPS, this.completedMin);
    return Math.min(heap.top().val, this.completedMin);
  }
  getFront(ord: number): Node[] {
    const r: Node[] = [];
    for (const fr of this.fronts[ord]) r.push(...fr);
    return r;
  }
  setupNextFronts() {
    this.fronts = this.nexts.map((byFund) => byFund.map((heap) => [...heap.items()].sort((a, b) => a.val - b.val)));
  }
  checkIterateResult(): boolean {
    const maxes = this.fronts.map((f) => f.reduce((s, x) => s + x.length, 0));
    const n = maxes.length;
    return !(maxes[n - 1] > 0 && maxes[n - 2] === 0 && maxes[n - 3] === 0);
  }

  // ---- 保存（target.nim の store） ----
  store(node: Node, ord: number) {
    const fund = node.fund.length;
    if (fund >= this.p.maxFundLevel) return;
    if (this.getStoredWorstVal(fund, ord) <= node.val) return;
    const hsh = hashing(node.mat);
    const st = this.stored[ord][fund];
    if (st.has(hsh)) return;
    const heap = this.nexts[ord][fund];
    heap.push(node);
    st.add(hsh);
    if (heap.len() > this.getMaxFunds(fund, ord)) heap.pop();
  }

  // ---- 1 回の反復 ----
  processFront(ord: number) {
    const front = this.getFront(ord);
    if (ord === this.orders.length) {
      if (front.length > 0) this.completedMin = Math.max(...front.map((f) => f.val)) + 1;
      for (const f of front) this.store(f, ord);
      if (front.length > 0) this.completedMin = Math.min(...front.map((f) => f.val));
      return;
    }
    const isTerminate = this.orders[ord].order === Order.Terminate;
    for (const f of front) {
      const t = new Target(this, f, ord);
      // Web 版で足した試し: 終了の命令では、ブロックを伸ばさずに今のブロックのまま周りを黒で囲むことも試す
      if (isTerminate && this.p.anyFundAtEnd && f.mat[f.x + f.y * this.w]!.color < CHROM_MAX) t.terminateHere();
      t.extendBlock();
      t.doOrder();
      t.pushBlack();
      t.goWhite();
      t.doFund();
    }
  }

  getResult(): { colors: Int8Array; val: number } {
    const last = this.fronts[this.fronts.length - 1];
    let front = last[0];
    if ((!front || front.length === 0) && this.p.anyFundAtEnd) front = last.find((f) => f.length > 0) ?? [];
    if (!front || front.length === 0) throw new Error("命令を最後まで実行する画像が見つかりませんでした");
    let minIndex = 0;
    let minVal = EPS;
    front.forEach((f, i) => {
      this.embedNotDecided(f);
      if (minVal < f.val) return;
      minIndex = i;
      minVal = f.val;
    });
    const f = front[minIndex];
    return { colors: Int8Array.from(f.mat, (b) => (b === null ? -1 : b.color)), val: f.val };
  }

  /** まだ決めていない所を埋める（元の色。だめなら近い色） */
  private embedNotDecided(f: Node) {
    const w = this.w;
    const initMat = f.mat.slice();
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < this.h; y++) {
        if (f.mat[x + y * w] !== null) continue;
        const color = this.img[x + y * w];
        let adjast = false;
        for (const [dx, dy] of DXDYS) {
          const nx = x + dx;
          const ny = y + dy;
          if (!this.isIn(nx, ny)) continue;
          const b = initMat[nx + ny * w];
          if (b === null) continue;
          if (b.color === color) {
            adjast = true;
            break;
          }
        }
        if (color < CHROM_MAX && adjast) continue;
        const v = { val: f.val };
        if (!this.updateMatVal(x, y, color, f.mat, v)) throw new Error("埋めるのに失敗");
        f.val = v.val;
      }
    }
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < this.h; y++) {
        if (f.mat[x + y * w] !== null) continue;
        const color = this.img[x + y * w];
        {
          const newMat = f.mat.slice();
          const v = { val: f.val };
          if (this.updateMatVal(x, y, color, newMat, v)) {
            f.mat = newMat;
            f.val = v.val;
            continue;
          }
        }
        const tries: { mat: Mat; val: number }[] = [];
        for (let c = 0; c < CHROM_MAX; c++) {
          const newMat = f.mat.slice();
          const v = { val: f.val };
          if (this.updateMatVal(x, y, c, newMat, v)) tries.push({ mat: newMat, val: v.val });
        }
        tries.sort((a, b) => a.val - b.val);
        f.mat = tries[0].mat;
        f.val = tries[0].val;
      }
    }
  }
}

/** 端の位置を (x, y) で更新できるか（使用済みの向きを変えるなら不可）。node.nim の canUpdateEndPos */
function canUpdateEndPos(e: BlockInfo, x: number, y: number): boolean {
  const upd = (d: number) => {
    if (e.used[d]) return false;
    e.px[d] = x;
    e.py[d] = y;
    return true;
  };
  if (y < e.py[UP_R] || (y === e.py[UP_R] && x > e.px[UP_R])) if (!upd(UP_R)) return false;
  if (y < e.py[UP_L] || (y === e.py[UP_L] && x < e.px[UP_L])) if (!upd(UP_L)) return false;
  if (y > e.py[DOWN_R] || (y === e.py[DOWN_R] && x < e.px[DOWN_R])) if (!upd(DOWN_R)) return false;
  if (y > e.py[DOWN_L] || (y === e.py[DOWN_L] && x > e.px[DOWN_L])) if (!upd(DOWN_L)) return false;
  if (x < e.px[LEFT_R] || (x === e.px[LEFT_R] && y < e.py[LEFT_R])) if (!upd(LEFT_R)) return false;
  if (x < e.px[LEFT_L] || (x === e.px[LEFT_L] && y > e.py[LEFT_L])) if (!upd(LEFT_L)) return false;
  if (x > e.px[RIGHT_R] || (x === e.px[RIGHT_R] && y > e.py[RIGHT_R])) if (!upd(RIGHT_R)) return false;
  if (x > e.px[RIGHT_L] || (x === e.px[RIGHT_L] && y < e.py[RIGHT_L])) if (!upd(RIGHT_L)) return false;
  return true;
}

/** 決めた色の並びのハッシュ（重複の判定用。元は Nim の hash。ここは 2 本の 32 ビットの FNV を合わせたもの） */
function hashing(mat: Mat): number {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < mat.length; i++) {
    const b = mat[i];
    const v = b === null ? 31 : b.color;
    h1 = Math.imul(h1 ^ v, 0x01000193);
    h2 = Math.imul(h2 ^ (v + i), 0x5bd1e995);
    h2 ^= h2 >>> 15;
  }
  return (h1 >>> 0) * 0x200000 + ((h2 >>> 0) & 0x1fffff);
}

function nextPos(b: BlockInfo, dp: DP, cc: CC): [number, number] {
  const d = dir8(cc, dp);
  return [b.px[d] + DXDY[dp][0], b.py[d] + DXDY[dp][1]];
}

class Target {
  constructor(
    readonly env: Env,
    readonly node: Node,
    readonly ord: number,
  ) {}

  private get here(): BlockInfo {
    return this.node.mat[this.node.x + this.node.y * this.env.w]!;
  }
  private nextKey(dFund: number, dOrd: number): [number, number] {
    return [this.node.fund.length + dFund, this.ord + dOrd];
  }
  private derive(over: Partial<Node>): Node {
    const n = this.node;
    return {
      val: over.val ?? n.val,
      x: over.x ?? n.x,
      y: over.y ?? n.y,
      dp: over.dp ?? n.dp,
      cc: over.cc ?? n.cc,
      mat: over.mat ?? n.mat.slice(),
      fund: over.fund ?? n.fund.slice(),
    };
  }

  /** 次に行ったことのない壁ではない所に行けるか（更新しない）。blockinfo.nim の searchNotVisited */
  private searchNotVisited(): { ok: boolean; dp: DP; cc: CC } {
    const env = this.env;
    const mat = this.node.mat;
    const b = this.here;
    let dp = this.node.dp;
    let cc = this.node.cc;
    for (let i = 0; i < 8; i++) {
      const used = b.used[dir8(cc, dp)];
      const [nx, ny] = nextPos(b, dp, cc);
      if (!env.isIn(nx, ny) || (mat[nx + ny * env.w] !== null && mat[nx + ny * env.w]!.color === BLACK)) {
        if (i % 2 === 0) cc = toggleCC(cc);
        else dp = toggleDP(dp);
        continue;
      }
      if (used) return { ok: false, dp: this.node.dp, cc: this.node.cc };
      return { ok: true, dp, cc };
    }
    return { ok: false, dp: this.node.dp, cc: this.node.cc };
  }

  /** 使用済みに印を付けて次の状態へ。blockinfo.nim の toNextState */
  private toNextState(mat: Mat): { ok: boolean; x: number; y: number; dp: DP; cc: CC } {
    const env = this.env;
    const { x, y } = this.node;
    const cur = mat[x + y * env.w]!;
    let dp = this.node.dp;
    let cc = this.node.cc;
    const usedDir = [false, false, false, false, false, false, false, false];
    for (let i = 0; i < 8; i++) {
      const used = cur.used[dir8(cc, dp)];
      const [nx, ny] = nextPos(cur, dp, cc);
      usedDir[dir8(cc, dp)] = true;
      if (!env.isIn(nx, ny) || (mat[nx + ny * env.w] !== null && mat[nx + ny * env.w]!.color === BLACK)) {
        if (i % 2 === 0) cc = toggleCC(cc);
        else dp = toggleDP(dp);
        continue;
      }
      if (used) return { ok: false, x, y, dp: this.node.dp, cc: this.node.cc };
      const nb = cur.copy();
      for (const [ncc, ndp] of ALL_CCDP) if (usedDir[dir8(ncc, ndp)]) nb.used[dir8(ncc, ndp)] = true;
      for (const b of nb.sameBlocks) mat[b] = nb;
      return { ok: true, x: nx, y: ny, dp, cc };
    }
    return { ok: false, x, y, dp: this.node.dp, cc: this.node.cc };
  }

  /** storedValue や制約を確かめて更新。target.nim の tryUpdate */
  private tryUpdate(x: number, y: number, color: PietColor, dFund: number, dOrd: number): { ok: boolean; val: number; mat: Mat } {
    const env = this.env;
    const tmp = this.node.val + env.dist(color, x, y);
    const [kf, ko] = this.nextKey(dFund, dOrd);
    if (env.getStoredWorstVal(kf, ko) <= tmp) return { ok: false, val: -1, mat: [] };
    const newMat = this.node.mat.slice();
    const v = { val: this.node.val };
    if (!env.updateMatVal(x, y, color, newMat, v)) return { ok: false, val: -1, mat: [] };
    return { ok: true, val: v.val, mat: newMat };
  }

  private tryUpdateNotVisited(color: PietColor, dFund: number, dOrd: number, onlyNil = false, onlySameColor = false, onlyNotUsedCCDP = false): boolean {
    const env = this.env;
    const r = this.searchNotVisited();
    if (!r.ok) return false;
    const [nx, ny] = nextPos(this.here, r.dp, r.cc);
    const nb = this.node.mat[nx + ny * env.w];
    if (nb === null) {
      const tmp = this.node.val + env.dist(color, nx, ny);
      const [kf, ko] = this.nextKey(dFund, dOrd);
      if (env.getStoredWorstVal(kf, ko) <= tmp) return false;
      return true;
    }
    if (onlyNil) return false;
    if (onlySameColor && nb.color !== color) return false;
    if (onlyNotUsedCCDP && nb.used[dir8(r.cc, r.dp)]) return false;
    return true;
  }

  terminateHere() {
    this.checkTerminate(this.node);
  }

  private checkTerminate(node: Node) {
    const env = this.env;
    const newMat = node.mat.slice();
    let dp = node.dp;
    let cc = node.cc;
    const v = { val: node.val };
    for (let i = 0; i < 8; i++) {
      // updateUsingNextPos
      const cur = newMat[node.x + node.y * env.w]!;
      if (!cur.used[dir8(cc, dp)]) {
        const nb = cur.copy();
        nb.used[dir8(cc, dp)] = true;
        for (const b of nb.sameBlocks) newMat[b] = nb;
      }
      const [nX, nY] = nextPos(newMat[node.x + node.y * env.w]!, dp, cc);
      if (node.mat.length && env.isIn(nX, nY)) {
        const t = newMat[nX + nY * env.w];
        if (t === null) {
          if (!env.updateMatVal(nX, nY, BLACK, newMat, v)) return;
        } else if (t.color !== BLACK) return;
      }
      if (i % 2 === 0) cc = toggleCC(cc);
      else dp = toggleDP(dp);
    }
    const next: Node = { val: v.val, x: node.x, y: node.y, mat: newMat, dp, cc, fund: node.fund.slice() };
    env.store(next, this.ord + 1);
  }

  extendBlock() {
    const env = this.env;
    const here = this.here;
    if (here.color >= CHROM_MAX) return;
    for (const b of here.sameBlocks) {
      const bx = b % env.w;
      const by = Math.floor(b / env.w);
      for (const [dx, dy] of DXDYS) {
        const nx = bx + dx;
        const ny = by + dy;
        if (!env.isIn(nx, ny)) continue;
        if (this.node.mat[nx + ny * env.w] !== null) continue;
        const r = this.tryUpdate(nx, ny, here.color, 0, 0);
        if (!r.ok) continue;
        const next = this.derive({ val: r.val, x: nx, y: ny, mat: r.mat });
        env.store(next, this.ord);
        if (env.orders[this.ord].order === Order.Terminate) this.checkTerminate(next);
      }
    }
  }

  /** 命令を実行する色を置き、dKey だけ進めて保存する。callback は余剰のスタックの操作 */
  private decide(order: Order, dFund: number, dOrd: number, callback: (n: Node) => boolean = () => true) {
    const env = this.env;
    const color = getNextColor(this.here.color, order);
    if (!this.tryUpdateNotVisited(color, dFund, dOrd, false, true, true)) return;
    const newMat = this.node.mat.slice();
    const r = this.toNextState(newMat);
    if (!r.ok) throw new Error("状態の遷移に失敗");
    const nb = newMat[r.x + r.y * env.w];
    if (nb !== null) {
      if (nb.color !== color || nb.used[dir8(r.cc, r.dp)]) throw new Error("状態の遷移に失敗");
      if (order === Order.Push && env.p.fixPush) newMat[this.node.x + this.node.y * env.w]!.sizeFix = true;
      const next = this.derive({ x: r.x, y: r.y, mat: newMat, dp: r.dp, cc: r.cc });
      if (!callback(next)) return;
      env.store(next, this.ord + dOrd);
      return;
    }
    const v = { val: this.node.val };
    if (!env.updateMatVal(r.x, r.y, color, newMat, v)) return;
    const next: Node = { val: v.val, x: r.x, y: r.y, mat: newMat, dp: r.dp, cc: r.cc, fund: this.node.fund.slice() };
    if (order === Order.Push) newMat[this.node.x + this.node.y * env.w]!.sizeFix = true;
    if (!callback(next)) return;
    env.store(next, this.ord + dOrd);
  }

  doOrder() {
    const here = this.here;
    if (here.color >= CHROM_MAX) return;
    if (this.node.fund.length > 0) return;
    const o = this.env.orders[this.ord];
    if (o.order === Order.Terminate) return;
    if (o.order === Order.Push && o.arg !== here.sameBlocks.length) return;
    this.decide(o.order, 0, 1);
  }

  goWhite() {
    const env = this.env;
    const here = this.here;
    if (here.color === WHITE) {
      const [dx, dy] = DXDY[this.node.dp];
      const nx = this.node.x + dx;
      const ny = this.node.y + dy;
      if (!env.isIn(nx, ny)) return;
      const next = this.node.mat[nx + ny * env.w];
      if (next !== null) {
        if (next.color === BLACK) return;
        if (next.color === WHITE) {
          env.store(this.derive({ x: nx, y: ny }), this.ord);
          return;
        }
        if (next.used[dir8(this.node.cc, this.node.dp)]) return;
        env.store(this.derive({ x: nx, y: ny }), this.ord);
        return;
      }
      for (let c = 0; c <= CHROM_MAX; c++) {
        const r = this.tryUpdate(nx, ny, c, 0, 0);
        if (!r.ok) continue;
        env.store(this.derive({ val: r.val, x: nx, y: ny, mat: r.mat }), this.ord);
      }
      return;
    }
    if (!this.tryUpdateNotVisited(WHITE, 0, 0, true)) return;
    const newMat = this.node.mat.slice();
    const r = this.toNextState(newMat);
    if (!r.ok) throw new Error("状態の遷移に失敗");
    const v = { val: this.node.val };
    if (newMat[r.x + r.y * env.w] !== null) throw new Error("状態の遷移に失敗");
    if (!env.updateMatVal(r.x, r.y, WHITE, newMat, v)) return;
    env.store({ val: v.val, x: r.x, y: r.y, mat: newMat, dp: r.dp, cc: r.cc, fund: this.node.fund.slice() }, this.ord);
  }

  pushBlack() {
    const env = this.env;
    const here = this.here;
    if (here.color >= CHROM_MAX) return;
    if (!this.tryUpdateNotVisited(BLACK, 0, 0, true)) return;
    const r = this.searchNotVisited();
    if (!r.ok) throw new Error("状態の遷移に失敗");
    const newMat = this.node.mat.slice();
    const [nx, ny] = nextPos(newMat[this.node.x + this.node.y * env.w]!, r.dp, r.cc);
    const v = { val: this.node.val };
    if (newMat[nx + ny * env.w] !== null) throw new Error("状態の遷移に失敗");
    if (!env.updateMatVal(nx, ny, BLACK, newMat, v)) return;
    env.store(this.derive({ val: v.val, mat: newMat }), this.ord);
  }

  private fundIt(order: Order, dFund: number, op: (n: Node) => boolean) {
    if (this.here.color < CHROM_MAX) this.decide(order, dFund, 0, op);
  }

  doFund() {
    const env = this.env;
    const n = this.node;
    // push は出たブロック（いまのブロック）の大きさ。元は入った先のブロックの大きさ（fixPush で直す）
    const pushSize = this.here.sameBlocks.length;
    this.fundIt(Order.Push, 1, (it) => {
      it.fund.push(env.p.fixPush ? pushSize : it.mat[it.x + it.y * env.w]!.sameBlocks.length);
      return true;
    });
    if (n.fund.length > 0) {
      this.fundIt(Order.Pop, -1, (it) => {
        it.fund.pop();
        return true;
      });
      this.fundIt(Order.Pointer, -1, (it) => {
        it.dp = toggleDP(it.dp, it.fund.pop()!);
        return true;
      });
      this.fundIt(Order.Switch, -1, (it) => {
        if (it.fund.pop()! % 2 === 1) it.cc = toggleCC(it.cc);
        return true;
      });
      this.fundIt(Order.Not, 0, (it) => {
        it.fund.push(it.fund.pop() === 0 ? 1 : 0);
        return true;
      });
      this.fundIt(Order.Dup, 1, (it) => {
        it.fund.push(it.fund[it.fund.length - 1]);
        return true;
      });
    }
    if (n.fund.length > 1) {
      const bin = (order: Order, f: (a: number, b: number) => number | null) =>
        this.fundIt(order, -1, (it) => {
          const top = it.fund.pop()!;
          const next = it.fund.pop()!;
          const r = f(next, top);
          if (r === null) return false;
          it.fund.push(r);
          return true;
        });
      bin(Order.Add, (a, b) => a + b);
      bin(Order.Sub, (a, b) => a - b);
      bin(Order.Mul, (a, b) => a * b);
      bin(Order.Div, (a, b) => (b === 0 ? null : Math.trunc(a / b)));
      bin(Order.Mod, (a, b) => (b === 0 ? null : a % b));
      bin(Order.Greater, (a, b) => (a > b ? 1 : 0));
      this.fundIt(Order.Roll, -2, (it) => {
        const top = it.fund.pop()!;
        const next = it.fund.pop()!;
        if (next > it.fund.length || next < 0 || top < 0) return false;
        const roll: number[] = [];
        for (let i = 0; i < next; i++) roll.push(it.fund.pop()!);
        for (let i = 0; i < next; i++) it.fund.push(roll[(i + top) % next]);
        return true;
      });
    }
  }
}

export interface SearchResult {
  /** Piet の色の番号（左上から行ごと） */
  colors: Int8Array;
  /** 元の画像との色差の合計（CIEDE2000 × 100） */
  cost: number;
  iterations: number;
}

/**
 * base: 元の画像を Piet の 20 色に寄せたもの。onProgress が false を返したら中止（例外）。
 */
export function quasiStegano2D(
  base: Int8Array,
  w: number,
  h: number,
  orders: PasmOrder[],
  params: SearchParams = DEFAULT_PARAMS,
  onProgress?: (p: SearchProgress) => boolean | void,
): SearchResult {
  if (w >= 32767 || h >= 32767) throw new Error("画像が大きすぎる");
  const env = new Env(base, w, h, orders, params);
  let it = 0;
  for (let progress = 0; progress < w * h; progress++) {
    it = progress + 1;
    env.prepare();
    for (let ord = 0; ord <= env.orders.length; ord++) env.processFront(ord);
    env.setupNextFronts();
    if (onProgress) {
      let reached = 0;
      env.fronts.forEach((f, i) => {
        if (f.some((x) => x.length > 0)) reached = i;
      });
      if (onProgress({ iteration: it, reached, orders: orders.length }) === false) throw new Error("中止しました");
    }
    if (!env.checkIterateResult()) break;
  }
  const r = env.getResult();
  return { colors: r.colors, cost: r.val, iterations: it };
}
