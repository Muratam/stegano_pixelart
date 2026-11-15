# Web 版（web/src/core/）の照合用の記録（golden）を、元の Nim のプログラムで作る。
# 直接は使わない。tools/golden/make.sh が src/ を作業用のディレクトリにコピーし、
# 中の値を外から読めるようにする最小の書き換え（export・シードと h を変数に・途中の値の記録）をしてからビルドする。
#   gen_golden <入力のディレクトリ> <出力のディレクトリ> <作業用のディレクトリ>
import json, os, sequtils, strutils, random, tables, math
import image, crmi, stc, util, crmidot

proc fhex(f: float): string = toHex(cast[int64](f))
proc cint(c: Color): int = c.toI

proc dumpImage(img: Image): string =
  # RGB を 16 進で並べたもの（画素は左上から行ごと）
  result = newStringOfCap(img.data.len * 6)
  for c in img.data:
    result.add toHex(c.r, 2) & toHex(c.g, 2) & toHex(c.b, 2)

proc runCase(name, input: string, M: seq[int], h, seed: int, outDir, work: string): JsonNode =
  goldenSeed = seed
  goldenH = h
  let img = input.loadImage()
  let (D, X, XREP) = img.distortionScoreMap()
  # 歪み: X の座標ごとに [色, 歪みの float64 のビット列]
  var dj = newJArray()
  for y in 0..<X.h:
    for x in 0..<X.w:
      var cell = newJArray()
      for dc in D[x][y]:
        cell.add %*[dc.color.cint, dc.distortion.fhex]
      dj.add cell
  let (stego, psnr, fixedCount) = img.crmiDotEmbed(M, work / name)
  let EX2 = stego.crmiDotDecode()
  let M2 = stcExtract(EX2, M.len, h)
  doAssert M2 == M, name & ": 取り出したメッセージが一致しない"
  stego.savePNG(outDir / ("stego_" & name & ".png"))
  var sj = newJArray()
  for s in goldenS:
    sj.add %*[s.pos.x, s.pos.y, s.color.cint, s.x, s.d.fhex]
  let n = goldenS.len
  let w = n div M.len
  result = %*{
    "name": name,
    "input": input.extractFilename,
    "width": img.w, "height": img.h,
    "seed": seed, "h": h,
    "wetColors": [[24, 20, 20]],
    "message": M.mapIt($it).join(""),
    "n": n, "w": w,
    "hhat": getBitMatrix(w, h),
    "representative": dumpImage(XREP),
    "distortion": dj,
    "S": sj,
    "SX": goldenS.mapIt($it.x).join(""),
    "EX": goldenEX.mapIt($it).join(""),
    "decodedEX": EX2.mapIt($it).join(""),
    "changedPixels": fixedCount,
    "psnr": psnr.fhex,
    "stego": "stego_" & name & ".png",
    "stegoRGB": dumpImage(stego),
  }

proc capacity(input: string): int = input.loadImage().crmiDotDecode().len

proc bitsFrom(seed, m: int): seq[int] =
  var r = initRand(seed)
  result = newSeqWith(m, r.rand(0..1))

when isMainModule:
  let inDir = paramStr(1)
  let outDir = paramStr(2)
  let work = paramStr(3)
  createDir outDir
  let mon = inDir / "mon_123.bmp"
  # 元のプログラム（crmidot.nim の isMainModule）と同じメッセージ: 既定の乱数の状態から画素数の 1% のビット
  let monImg = mon.loadImage()
  let origM = newSeqWith(int(0.01 * float(monImg.w * monImg.h)), rand(0..1))
  var cases = newJArray()
  cases.add runCase("mon_orig", mon, origM, 10, 1234, outDir, work)
  cases.add runCase("mon_full", mon, bitsFrom(7, mon.capacity div 2), 10, 1234, outDir, work)
  cases.add runCase("mon_h7_seed", mon, bitsFrom(11, 40), 7, 20200305, outDir, work)
  let land = inDir / "landscape.png"
  cases.add runCase("landscape", land, bitsFrom(13, 60), 10, 1234, outDir, work)
  cases.add runCase("landscape_h12", land, bitsFrom(17, land.capacity div 3), 12, 99, outDir, work)
  let shp = inDir / "shapes.png"
  cases.add runCase("shapes", shp, bitsFrom(19, 100), 8, 42, outDir, work)
  cases.add runCase("shapes_h6", shp, bitsFrom(23, shp.capacity div 2), 6, 1234, outDir, work)
  cases.add runCase("sprite_rgba", inDir / "sprite_rgba.png", bitsFrom(29, 30), 10, 1234, outDir, work)
  # 共通: crmi の重みを足す順（Table の順。浮動小数の和の順に効く）と、乱数の確認用の値
  var r = initRand(1234)
  var rs = newJArray()
  for i in 0..<8: rs.add %($r.next())
  var rr = initRand(1234)
  var rb = newJArray()
  for i in 0..<64: rb.add %rr.rand(0..1)
  var r3 = initRand(1)
  var rh = newJArray()
  for i in 0..<16: rh.add %r3.rand(0..<(1 shl 10))
  let all = %*{
    "nim": NimVersion,
    "keyOfW": keyOfW,
    "rand1234next": rs,
    "rand1234bits": rb,
    "rand1h10": rh,
    "cases": cases,
  }
  writeFile(outDir / "golden.json", $all & "\n")
  echo "golden: ", cases.len, " cases"
