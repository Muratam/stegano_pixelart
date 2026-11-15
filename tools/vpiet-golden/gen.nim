# Web 版の VPiet（web/src/vpiet/）の照合用の記録を、元の vpiet（github.com/Muratam/vpiet）で作る。
# 直接は使わない。tools/vpiet-golden/make.sh が vpiet の packages/ を作業用のディレクトリにコピーし、ビルドの邪魔になる所
# （使わない正規表現・ncurses のライブラリ名）だけを書き換えてから、このファイルをその直下に置いてビルドする。
#   gen <ケースのファイル> <出力の JSON>
# ケースのファイル: 1 行目に入力の PNG、2 行目に maxFrontierNum maxFundLevel maxTrackBackOrderLen、3 行目以降に PASM の命令（push n・dup・outc …）
import json, os, strutils, sequtils
import packages/[common, pietbase, frompiet]
import packages/projects/stegano/[pasm, stego, node]

proc parseOrders(lines: seq[string]): seq[PasmOrder] =
  for line in lines:
    let ws = line.strip().splitWhitespace()
    if ws.len == 0: continue
    let o = ws[0].interpretOrder()
    doAssert o != ErrorOrder, line
    if o == Terminate: result &= (MoveTerminate, Terminate, newSeq[string]())
    else: result &= (ExecOrder, o, ws[1..^1])

proc toJson(m: Matrix[PietColor]): JsonNode =
  result = newJArray()
  for y in 0..<m.height:
    var row = newJArray()
    for x in 0..<m.width: row.add %m[x, y].int
    result.add row

when isMainModule:
  let lines = readFile(paramStr(1)).strip().splitLines()
  let input = lines[0].strip()
  let ps = lines[1].splitWhitespace().mapIt(it.parseInt())
  let orders = parseOrders(lines[2..^1])
  let base = input.newPietMap().pietColorMap
  let t0 = cpuTime()
  let res = newEnv(base, orders, maxFrontierNum = ps[0], maxFundLevel = ps[1],
      maxTrackBackOrderLen = ps[2]).quasiStegano2D()
  let elapsed = cpuTime() - t0
  var changed = 0
  var cost = 0
  for i in 0..<res.data.len:
    if res.data[i] != base.data[i]: inc changed
    cost += distance(res.data[i], base.data[i])
  # 色差の表（20 色 × 20 色。CIEDE2000 × 100 の整数）
  var dist = newJArray()
  for a in 0..maxColorNumber:
    var row = newJArray()
    for b in 0..maxColorNumber: row.add %distance(a.PietColor, b.PietColor)
    dist.add row
  let outj = %*{
    "input": input.extractFilename,
    "params": ps,
    "orders": lines[2..^1].mapIt(it.strip()).filterIt(it.len > 0),
    "base": base.toJson,
    "result": res.toJson,
    "changed": changed,
    "cost": cost,
    "seconds": elapsed,
    "distance": dist,
  }
  writeFile(paramStr(2), $outj & "\n")
