/**
 * Nim 1.2 の std/random（xoroshiro128+）と同じ乱数。
 * 元のプログラムは initRand(1234) でマスクと並べ替えを、initRand(1) で STC の小行列を作る。
 * 同じ列を出さないと取り出しができないので、版ごとの違い（Nim 2 の initRand は初期化が違う）も含めて Nim 1.2 に合わせる。
 */
const MASK64 = (1n << 64n) - 1n;
const RAND_MAX = MASK64;

function rotl(x: bigint, k: bigint): bigint {
  return ((x << k) | (x >> (64n - k))) & MASK64;
}

export class NimRand {
  private a0: bigint;
  private a1: bigint;

  /** initRand(seed)（Nim 1.2）。seed は 0 以外の正の整数 */
  constructor(seed: number | bigint) {
    const s = BigInt(seed);
    if (s <= 0n || s > (1n << 62n)) throw new RangeError("seed は 1 以上 2^62 以下");
    this.a0 = (s >> 16n) & MASK64;
    this.a1 = s & 0xffffn;
    this.next();
  }

  next(): bigint {
    const s0 = this.a0;
    let s1 = this.a1;
    const result = (s0 + s1) & MASK64;
    s1 ^= s0;
    this.a0 = rotl(s0, 55n) ^ s1 ^ ((s1 << 14n) & MASK64);
    this.a1 = rotl(s1, 36n);
    return result;
  }

  /** rand(max): 0..max（Nim 1.2 の偏りを除く判定もそのまま） */
  rand(max: number): number {
    if (max === 0) return 0;
    const m = BigInt(max);
    const limit = RAND_MAX - (RAND_MAX % m);
    for (;;) {
      const x = this.next();
      if (x <= limit) return Number(x % (m + 1n));
    }
  }

  /** shuffle（Fisher–Yates。後ろから） */
  shuffle<T>(a: T[]): void {
    for (let i = a.length - 1; i >= 1; i--) {
      const j = this.rand(i);
      const t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
  }
}
