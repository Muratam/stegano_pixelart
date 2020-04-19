import random,sequtils,math,strutils,strformat
template `max=`*(x,y) = x = max(x,y)
template `min=`*(x,y) = x = min(x,y)
template `xor=`*(x,y) = x = x xor y
template `shr=`*(x,y) = x = x shr y
template `shl=`*(x,y) = x = x shl y
template `and=`*(x,y) = x = x and y
template `or=`*(x,y) = x = x or y
proc `$`(X:seq[seq[int]]):string =
  for y in 0..<X[0].len:
    for x in 0..<X.len:
      result &= $X[x][y] #& " "
    result &= "\n"
proc `$`(X:seq[int]):string =
  for x in 0..<X.len: result &= $X[x] #& " "
proc `**`(x,n:int): int =
  if n <= 1: return if n == 1: x else: 1
  let pow_2 = `**`(x,n div 2)
  return pow_2 * pow_2 * (if n mod 2 == 1: x else: 1)
proc nthBit(x,n:int):int = (x and (1 shl n)) shr n
proc argmin[T](arr:seq[T]): int =
  let minVal = arr.min()
  for i,a in arr:
    if a == minVal: return i
# WARN: wet pixel
# WARN: multi-layered
# 自作のものを使った場合で crmi でどれくらい埋め込めるか調べてみる
# たぶん定数倍遅い
# m/n < 1/2
# 適宜速度を上げていきましょう
# column毎の int notation のほうが楽ではやいかもしれない？
proc popcount(x: culonglong): cint {.importc: "__builtin_popcountll", cdecl.}
# need the same seed
proc getBitMatrix(w,h:int) : seq[int] =
  doAssert h in 6..15
  doAssert w >= 2
  const seed = 1
  var r = initRand(seed)
  proc randWithPopCount(allowRate:float = 0.0):int =
    while true:
      result = r.rand(0..<(1 shl h))
      if result.culonglong.popcount().float >= h.float * allowRate:
        return result
  while true:
    let B = newSeqWith(w,randWithPopCount())
    var isOK = true
    for i in 0..<w:
      for j in (i+1)..<w:
        if B[i] == B[j]: isOK = false
    if isOK : return B

proc toMatrix(M:seq[int],h:int):seq[seq[int]] =
  let w = M.len
  result = newSeqWith(w,newSeqWith(h,0))
  for x in 0..<w:
    for y in 0..<h:
      result[x][y] = (M[x] shl y)and 1

proc stcExtractNaive(YB:seq[int],m,h:int) :seq[int]=
  let Y = YB.mapIt(it mod 2)
  let n = Y.len
  let w = n div m
  result = newSeqWith(m,0)
  let hhat = getBitMatrix(w,h).toMatrix(h)
  for y in 0..<m:
    let l = w * (y+1-h)
    let r = w * (y+1)
    var xi = w-1
    var yi = h
    for x in l..<r.min(n):
      xi += 1
      if xi == w :
        xi = 0
        yi -= 1
      if x < 0: continue
      result[y] .xor= hhat[xi][yi] * Y[x]


proc stcExtract*(Y:seq[int],m,h:int) :seq[int]=
  let n = Y.len
  let w = n div m
  result = newSeqWith(m,0)
  let hhat = getBitMatrix(w,h)
  var tmp = 0 # 2^h の状態を持つ
  for mi in 0..<m:
    for ci in 0..<w:
      let y = Y[mi*w+ci]
      assert y in 0..1
      tmp .xor= hhat[ci] * y
    result[mi] .xor= tmp and 1
    tmp .shr= 1

# やってることはただのDP
proc stcEmbed*(M:seq[int],X:seq[int],XS,PS:seq[seq[int]],DS:seq[seq[float]],h:int): seq[int] =
  # P : そのDにしたときのもの
  assert PS.allIt(it.allIt(it in 0..1))
  let n = PS.len # image len
  let m = M.len # message len
  let w = n div m
  let hhat = getBitMatrix(w,h)
  const INF = 1e12
  var dp = newSeqWith(1 shl h,INF)
  var dpPath = newSeqWith(n,newSeqWith(1 shl h,-1))
  dp[0] = 0
  for mi in 0..<m: # num of blocks
    for ci in 0..<w: # for each column
      var newDP = newSeqWith(1 shl h,INF)
      let ni = mi * w + ci
      for k in 0..<1 shl h:
        for kind,p in PS[ni]:
          let d = DS[ni][kind]
          let next = k xor (hhat[ci] * p)
          let val = dp[k] + d
          if val > newDP[next] : continue
          newDP[next] = val
          dpPath[ni][next] = kind
      dp = newDP
    let h2 = 1 shl (h-1)
    for k in 0..<h2: dp[k] = dp[k*2 + M[mi]]
    for k in 0..<h2: dp[k + h2] = INF
  # WARN : n - m*w の足りない部分は全く使われない
  #   echo fmt"n:{n} m:{m} w:{w} mw:{m*w}"
  # echo dpPath
  # echo dp
  # echo dp.mapIt(if it >= INF : "X" else: $(it.int)).join("")
  var kinds = newSeqWith(X.len,-1)
  var state = dp.argmin() * 2 + M[^1]
  for mi in (m-1).countdown(0):
    for ci in (w-1).countdown(0):
      let ni = mi * w + ci
      let kind = dpPath[ni][state]
      kinds[ni] = kind
      state .xor= PS[ni][kind] * hhat[ci]
    if mi == 0: break
    state = (state * 2 + M[mi-1]) and ((1 shl h) - 1)
  result = X
  for i in 0..<m*w: result[i] = XS[i][kinds[i]]

# binary画像の場合
proc stcBinaryEmbed*(X:seq[int],D:seq[float],M:seq[int],h:int):seq[int] =
  let n = X.len
  let XS = newSeqWith(n,@[0,1])
  let PS = XS
  let DS = toSeq(0..<n).mapIt:
    var t = @[D[it],D[it]]
    t[X[it]] = 0
    t
  return stcEmbed(M,X,XS,PS,DS,h)

proc plotDiff*(A,B:seq[int],onlyDiffPercent:bool=false) =
  let diff = toSeq(0..<A.len).mapIt(abs(A[it]-B[it])).mapIt(int(it > 0))
  if onlyDiffPercent:
    echo fmt"{diff.sum()}/{diff.len()}"
    return
  echo A
  echo B
  proc zeroToSpace(A:seq[int]):string = A.mapIt(if it == 0 : " " else: "X").join("")
  echo fmt"{diff.zeroToSpace()}({diff.sum()}/{diff.len()})"

proc stcTest() =
  # [0-3] の値を取り,constant profile(自身以外はρ=1)
  # 600文字に対して100文字埋め込むテスト
  randomize()
  let h = 10
  let maxKind = 4
  let M = newSeqWith(100,rand(0..1))
  let X = newSeqWith(600,rand(0..<maxKind))
  let XS = X.mapIt(toSeq(0..<maxKind))
  let PS = XS.mapIt(it.mapIt(it mod 2))
  let DS = X.mapIt:
    var t = newSeqWith(maxKind,1.0)
    t[it] = 0.0
    t
  let Y = stcEmbed(M,X,XS,PS,DS,h)
  let M2 = stcExtract(Y.mapIt(it mod 2),M.len,h)
  echo "X:";plotDiff(X,Y)
  echo "M:";plotDiff(M,M2)

proc stcDamagedTest() =
  # [0-3] の値を取り,constant profile(自身以外はρ=1)
  # 600文字に対して100文字埋め込むテスト
  randomize()
  let h = 6
  let maxKind = 4
  let M = newSeqWith(100,rand(0..1))
  let X = newSeqWith(600,rand(0..<maxKind))
  let XS = X.mapIt(toSeq(0..<maxKind))
  let PS = XS.mapIt(it.mapIt(it mod 2))
  let DS = X.mapIt:
    var t = newSeqWith(maxKind,1.0)
    t[it] = 0.0
    t
  let Y = stcEmbed(M,X,XS,PS,DS,h)
  # 更に通信路でpパーセントが変化してしまう.
  let p = 0.01
  let Y2 = Y.mapIt((if rand(0..100) < (p * 100).int: (it + 1) mod maxKind else: it ))
  echo "X:";plotDiff(Y,Y2)
  # echo "X:";plotDiff(Y,Y2)
  let MY = stcExtract(Y.mapIt(it mod 2),M.len,h)
  let MY2 = stcExtract(Y2.mapIt(it mod 2),M.len,h)
  # echo "X:";plotDiff(X,Y)
  echo "M-MY:";plotDiff(M,MY)
  echo "M-MY2:";plotDiff(M,MY2)
  echo "MY-MY2:";plotDiff(MY,MY2)


if isMainModule:
  # stcTest()
  stcDamagedTest()
