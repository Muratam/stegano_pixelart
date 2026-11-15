/**
 * Web 版で足したもの: 文字列のメッセージをビットの列にする形式と、鍵（文字列）から乱数のシードを作る方法。
 * 元のプログラムはビットの列をそのまま埋め込み、取り出すときに長さ m を知っている前提だった。
 * Web 版では長さを知らなくても取り出せるように、先頭に長さと検査の値を付け、取り出しでは STC の列の数 w を順に試す。
 *
 * ビットの列: [長さ（バイト、16 ビット）][本文（UTF-8）][CRC-16/CCITT-FALSE（長さと本文に対して、16 ビット）][0 の詰め物]
 * いずれも上位のビットから。詰め物は、w = n div m が大きくなりすぎない（小行列 Ĥ が作れる）ようにするため。
 */
import { stcExtractW } from "./stc";

export const HEADER_BITS = 32;

export function crc16(bytes: Uint8Array): number {
  let crc = 0xffff;
  for (const b of bytes) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}

/** STC の列の数 w の上限。Ĥ の w 本の列（h ビット）が全部異なる確率が低くなりすぎない大きさ（およそ e^-4 以上） */
export function maxColumns(h: number): number {
  return Math.min(1 << h, Math.floor(Math.sqrt(2 ** (h + 3))));
}

function pushBits(out: number[], v: number, nbits: number) {
  for (let i = nbits - 1; i >= 0; i--) out.push((v >> i) & 1);
}

/** 本文の最大のバイト数（n: ビットを持てる画素の数） */
export function capacityBytes(n: number): number {
  return Math.max(0, Math.floor((Math.floor(n / 2) - HEADER_BITS) / 8));
}

export function encodeMessage(text: string, n: number, h: number): number[] {
  const body = new TextEncoder().encode(text);
  if (body.length > 0xffff) throw new Error("メッセージが長すぎます");
  const head = new Uint8Array(2 + body.length);
  head[0] = body.length >> 8;
  head[1] = body.length & 0xff;
  head.set(body, 2);
  const bits: number[] = [];
  for (const b of head) pushBits(bits, b, 8);
  pushBits(bits, crc16(head), 16);
  const cap = capacityBytes(n);
  if (body.length > cap) throw new Error(`メッセージが長すぎます（この画像では ${cap} バイトまで。いまは ${body.length} バイト）`);
  // w = n div m ≤ maxColumns(h) になるまで 0 を詰める
  const minBits = Math.ceil(n / maxColumns(h));
  while (bits.length < minBits) bits.push(0);
  return bits;
}

function bitsToBytes(bits: number[], from: number, count: number): Uint8Array {
  const out = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | bits[from + i * 8 + j];
    out[i] = v;
  }
  return out;
}

export interface DecodedMessage {
  text: string;
  /** 見つかった STC の列の数 */
  w: number;
  bytes: number;
}

/**
 * 取り出し: EX（並べ替えた後のビット）から、w = 2, 3, … と順に試し、長さと CRC が合い UTF-8 として読めるものを返す。
 * 見つからなければ null（鍵か h が違う、画像が変わった、そもそも埋め込まれていない）。
 */
export function decodeMessage(EX: number[], h: number): DecodedMessage | null {
  const n = EX.length;
  const wMax = maxColumns(h);
  for (let w = 2; w <= wMax; w++) {
    const mMax = Math.floor(n / w);
    if (mMax < HEADER_BITS) break;
    const head = stcExtractW(EX, 16, w, h);
    const len = bitsToBytes(head, 0, 2);
    const L = (len[0] << 8) | len[1];
    const need = HEADER_BITS + 8 * L;
    if (need > mMax) continue;
    const bits = stcExtractW(EX, need, w, h);
    const bytes = bitsToBytes(bits, 0, 2 + L);
    const crc = (bitsToBytes(bits, 8 * (2 + L), 2)[0] << 8) | bitsToBytes(bits, 8 * (2 + L), 2)[1];
    if (crc !== crc16(bytes)) continue;
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(2));
      return { text, w, bytes: L };
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * 鍵 → 乱数のシード。数字だけの鍵はその数（1〜2^53）をそのまま使う（元のプログラムは 1234）。
 * それ以外は UTF-8 の FNV-1a（64 ビット）の下位 62 ビット（0 なら 1）。空の鍵は 1234。
 */
export const DEFAULT_KEY = "1234";
export function seedFromKey(key: string): bigint {
  const k = key.trim();
  if (k === "") return 1234n;
  if (/^[0-9]{1,16}$/.test(k)) {
    const v = BigInt(k);
    if (v >= 1n && v <= 2n ** 53n) return v;
  }
  let hash = 0xcbf29ce484222325n;
  for (const b of new TextEncoder().encode(k)) {
    hash ^= BigInt(b);
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  const s = hash & ((1n << 62n) - 1n);
  return s === 0n ? 1n : s;
}
