/**
 * Piet のインタプリタ（1 ステップずつ実行できる）。仕様は https://www.dangermouse.net/esoteric/piet.html に沿う
 * （白の上の滑り・8 回ぶつかったら終了・失敗する命令は無視して進む）。Piet の 20 色以外の色は白として扱う（npiet の既定と同じ）。
 */
import { BLACK, decideOrder, DXDY, Order, ORDER_NAMES, toggleCC, toggleDP, WHITE, type CC, type DP, type PietColor } from "./piet";

export interface Program {
  width: number;
  height: number;
  /** 色（コーデル単位。左上から行ごと） */
  colors: Int8Array;
}

interface Block {
  color: PietColor;
  size: number;
  /** [dp][cc] の端のコーデル（x, y） */
  edge: [number, number][][];
}

export interface StepInfo {
  /** 実行した命令（無ければ null） */
  order: string | null;
  /** 命令の前のブロック（x, y） */
  from: [number, number];
}

export class PietMachine {
  readonly prog: Program;
  private blockOf: Int32Array;
  private blocks: Block[] = [];
  x = 0;
  y = 0;
  dp: DP = 0;
  cc: CC = 1; // 始めは DP 右・CC 左
  stack: number[] = [];
  output = "";
  steps = 0;
  finished = false;
  lastOrder: string | null = null;
  private input: number[];
  private inputPos = 0;

  constructor(prog: Program, input = "") {
    this.prog = prog;
    this.input = [...input].map((c) => c.codePointAt(0) ?? 0);
    this.blockOf = new Int32Array(prog.width * prog.height).fill(-1);
    this.analyze();
    if (this.colorAt(0, 0) === BLACK) this.finished = true;
  }

  colorAt(x: number, y: number): PietColor {
    return this.prog.colors[x + y * this.prog.width];
  }
  private inside(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.prog.width && y < this.prog.height;
  }
  private blocked(x: number, y: number) {
    return !this.inside(x, y) || this.colorAt(x, y) === BLACK;
  }

  /** 同じ色の 4 連結のブロックと、その 8 方向の端のコーデル */
  private analyze() {
    const { width: w, height: h } = this.prog;
    for (let sy = 0; sy < h; sy++) {
      for (let sx = 0; sx < w; sx++) {
        if (this.blockOf[sx + sy * w] >= 0) continue;
        const color = this.colorAt(sx, sy);
        const id = this.blocks.length;
        const cells: [number, number][] = [];
        const st: [number, number][] = [[sx, sy]];
        this.blockOf[sx + sy * w] = id;
        while (st.length) {
          const [x, y] = st.pop()!;
          cells.push([x, y]);
          for (const [dx, dy] of DXDY) {
            const nx = x + dx;
            const ny = y + dy;
            if (!this.inside(nx, ny) || this.blockOf[nx + ny * w] >= 0 || this.colorAt(nx, ny) !== color) continue;
            this.blockOf[nx + ny * w] = id;
            st.push([nx, ny]);
          }
        }
        // dp の向きでいちばん端の辺のうち、cc の向き（dp から見て左・右）でいちばん端のコーデル
        const edge: [number, number][][] = [];
        for (let dp = 0; dp < 4; dp++) {
          const [dx, dy] = DXDY[dp];
          let best = -Infinity;
          for (const [x, y] of cells) best = Math.max(best, x * dx + y * dy);
          const front = cells.filter(([x, y]) => x * dx + y * dy === best);
          edge[dp] = [];
          for (let cc = 0; cc < 2; cc++) {
            // cc 左（1）は dp を反時計回りに 90°、右（0）は時計回りに 90°
            const [ex, ey] = DXDY[cc === 1 ? (dp + 3) % 4 : (dp + 1) % 4];
            let bv = -Infinity;
            let pick: [number, number] = front[0];
            for (const [x, y] of front) {
              const v = x * ex + y * ey;
              if (v > bv) {
                bv = v;
                pick = [x, y];
              }
            }
            edge[dp][cc] = pick;
          }
        }
        this.blocks.push({ color, size: cells.length, edge });
      }
    }
  }

  blockSizeAt(x: number, y: number) {
    return this.blocks[this.blockOf[x + y * this.prog.width]].size;
  }

  /** 1 ステップ（次の色のブロックへ移る。白は滑り抜ける）。終わったら false */
  step(): boolean {
    if (this.finished) return false;
    this.lastOrder = null;
    const from = this.colorAt(this.x, this.y);
    if (from === WHITE) return this.slideWhite(this.x, this.y);
    const block = this.blocks[this.blockOf[this.x + this.y * this.prog.width]];
    for (let attempt = 0; attempt < 8; attempt++) {
      const [ex, ey] = block.edge[this.dp][this.cc];
      const [dx, dy] = DXDY[this.dp];
      const nx = ex + dx;
      const ny = ey + dy;
      if (!this.blocked(nx, ny)) {
        const to = this.colorAt(nx, ny);
        this.x = nx;
        this.y = ny;
        this.steps++;
        if (to === WHITE) return this.slideWhite(nx, ny);
        this.exec(decideOrder(from, to), block.size);
        return !this.finished;
      }
      if (attempt % 2 === 0) this.cc = toggleCC(this.cc);
      else this.dp = toggleDP(this.dp);
    }
    this.finished = true;
    return false;
  }

  /** 白の上を dp の向きに滑る。ぶつかったら cc と dp を変える。同じ所に同じ向きで戻ったら終了 */
  private slideWhite(sx: number, sy: number): boolean {
    let x = sx;
    let y = sy;
    const seen = new Set<string>();
    for (;;) {
      const key = `${x},${y},${this.dp},${this.cc}`;
      if (seen.has(key)) {
        this.finished = true;
        return false;
      }
      seen.add(key);
      const [dx, dy] = DXDY[this.dp];
      const nx = x + dx;
      const ny = y + dy;
      if (this.blocked(nx, ny)) {
        this.cc = toggleCC(this.cc);
        this.dp = toggleDP(this.dp);
        continue;
      }
      x = nx;
      y = ny;
      if (this.colorAt(x, y) !== WHITE) {
        this.x = x;
        this.y = y;
        this.steps++;
        return true;
      }
    }
  }

  private exec(order: Order, size: number) {
    const s = this.stack;
    const need = (n: number) => s.length >= n;
    this.lastOrder = ORDER_NAMES[order] ?? null;
    switch (order) {
      case Order.Push:
        s.push(size);
        break;
      case Order.Pop:
        if (need(1)) s.pop();
        break;
      case Order.Add:
      case Order.Sub:
      case Order.Mul:
      case Order.Div:
      case Order.Mod:
      case Order.Greater: {
        if (!need(2)) break;
        const a = s[s.length - 2];
        const b = s[s.length - 1];
        if ((order === Order.Div || order === Order.Mod) && b === 0) break;
        s.length -= 2;
        if (order === Order.Add) s.push(a + b);
        else if (order === Order.Sub) s.push(a - b);
        else if (order === Order.Mul) s.push(a * b);
        else if (order === Order.Div) s.push(Math.trunc(a / b)); // npiet と同じく 0 に向けて切り捨て
        else if (order === Order.Mod) s.push(((a % b) + b) % b);
        else s.push(a > b ? 1 : 0);
        break;
      }
      case Order.Not:
        if (need(1)) s.push(s.pop() === 0 ? 1 : 0);
        break;
      case Order.Pointer:
        if (need(1)) this.dp = toggleDP(this.dp, s.pop()!);
        break;
      case Order.Switch:
        if (need(1)) {
          if (Math.abs(s.pop()!) % 2 === 1) this.cc = toggleCC(this.cc);
        }
        break;
      case Order.Dup:
        if (need(1)) s.push(s[s.length - 1]);
        break;
      case Order.Roll: {
        if (!need(2)) break;
        const n = s[s.length - 1];
        const depth = s[s.length - 2];
        if (depth < 0 || depth > s.length - 2) break;
        s.length -= 2;
        if (depth === 0) break;
        const part = s.splice(s.length - depth, depth);
        const r = ((n % depth) + depth) % depth;
        s.push(...part.slice(depth - r), ...part.slice(0, depth - r));
        break;
      }
      case Order.InN: {
        let str = "";
        while (this.inputPos < this.input.length && /\s/.test(String.fromCodePoint(this.input[this.inputPos]))) this.inputPos++;
        while (this.inputPos < this.input.length && /[-0-9]/.test(String.fromCodePoint(this.input[this.inputPos])))
          str += String.fromCodePoint(this.input[this.inputPos++]);
        const v = parseInt(str, 10);
        if (!Number.isNaN(v)) s.push(v);
        break;
      }
      case Order.InC:
        if (this.inputPos < this.input.length) s.push(this.input[this.inputPos++]);
        break;
      case Order.OutN:
        if (need(1)) this.output += String(s.pop());
        break;
      case Order.OutC:
        if (need(1)) {
          const v = s.pop()!;
          try {
            this.output += String.fromCodePoint(v);
          } catch {
            this.output += "�";
          }
        }
        break;
      default:
        break;
    }
  }

  /** 終わるまで（上限つき）実行する */
  run(maxSteps = 100000): void {
    while (this.steps < maxSteps && this.step());
  }
}
