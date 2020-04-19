import sequtils,hashes,strformat,tables,algorithm,sets,random,math,os
import crmi,util,image,stc
template `max=`*(x,y) = x = max(x,y)
template `min=`*(x,y) = x = min(x,y)
const INF = 1e12

proc plotDiff*(A,B:seq[int],onlyDiffPercent:bool=false) =
  let diff = toSeq(0..<A.len).mapIt(abs(A[it]-B[it])).mapIt(int(it > 0))
  echo fmt"({diff.sum()}/{diff.len()})"


# 代表色.一番多い色で優先度はdp4の順.
proc representationMap(image:Image):Image =
  var resR = initImage(image.w-4,image.h-4)
  for x in 2..<image.w-2:
    for y in 2..<image.h-2:
      var colors : seq[tuple[colorI,cnt:int]] =
        toSeq(dP4.mapIt(image[it+(x,y)].toI).toCountTable().pairs)
      colors = colors.sortedByIt(-it.cnt)
      if colors.len == 1 or colors[0].cnt > colors[1].cnt:
        resR[x-2,y-2] = colors[0].colorI.toC
        continue
      let colorsC = colors.filterIt(it.cnt == colors[0].cnt).mapIt(it.colorI.toC)
      var ok = false
      for d in dP4:
        if image[d+(x,y)] in colorsC:
          resR[x-2,y-2] = image[d+(x,y)]
          ok = true
          break
      doAssert(ok)
  return resR
# 歪みマップを生成する
proc distortionScoreMap(image:Image):
    tuple[
      distortionMap:seq[seq[seq[DistAndColor]]],
      img:Image,
      represents:Image]=
  # const wetColors: seq[Color] =  @[[0u8,0u8,0u8]]
  const wetColors: seq[Color] =  @[[24u8, 20u8, 20u8]]
  # const wetColors: seq[Color] =  @[]
  let getColorDistance = image.makeColorDistanceFunction()
  let allCrmiLTP = image.getAllCrmiLTP()
  # Hを変えたときの作業領域
  var tmpImg = image.deepCopy()
  # 結果の歪みマップ
  var D = newSeqWith(image.w,newSeq[seq[DistAndColor]](image.h))
  for y in 2..<image.h-2:
    for x in 2..<image.w-2:
      # 中心をその色に変更する
      for (crmi,color) in allCrmiLTP[x][y]:
        # 自分自身と同じ色に変えるコストは 0
        if color == image[x,y]:
          D[x][y] &= (0.0,color)
          continue
        tmpImg[x,y] = color
        var diff = newSeq[int](256)
        var diff2 = newSeq[int](256)
        # 5x5 の範囲である色かどうか
        for px in [x-1,x,x+1]:
          for py in [y-1,y,y+1]:
            block:
              let base = image.crmiLTP(px,py,color)
              let to = tmpImg.crmiLTP(px,py,color)
              diff[base] -= 1
              diff[to] += 1
            block:
              let base = image.crmiLTP(px,py,image[x,y])
              let to = tmpImg.crmiLTP(px,py,image[x,y])
              diff2[base] -= 1
              diff2[to] += 1
        tmpImg[x,y] = image[x,y]
        # 評価関数は単純和なので alpha と beta が効いてくる
        const alpha = 0.5
        const beta = 0.5
        let dCrmi = keyOfW.mapIt(W[it] * diff[it].abs.float).sum().pow(alpha) + beta
        let dCrmi2 = keyOfW.mapIt(W[it] * diff2[it].abs.float).sum().pow(alpha) + beta
        let dColor = getColorDistance(color,image[x,y])
        var d = (dCrmi.max(dCrmi2)) * dColor
        if color in wetColors or image[x,y] in wetColors:
          d += 100000.0
        D[x][y] &= (d,color)
  # 外側2px分を縮めて返却する
  var resD = newSeqWith(image.w-4,newSeqWith(image.h-4,newSeq[DistAndColor]()))
  var resI = initImage(image.w-4,image.h-4)
  var resR = image.representationMap()
  for x in 2..<image.w-2:
    for y in 2..<image.h-2:
      resD[x-2][y-2] = D[x][y]
      resI[x-2,y-2] = image[x,y]
  return (resD,resI,resR)
# 可視化用. 線形に変換する.
proc distortionMap(image:Image) : Image =
  let (DB,X,_) = image.distortionScoreMap()
  var img = initImage(X.w+4,X.h+4)
  for x in 0..<X.w+4:
    for y in 0..<X.h+4:
      img[x,y] .all= 255
  var minR = 1e10
  var maxR = 0f
  for x in 0..<X.w:
    for y in 0..<X.h:
      let d = DB[x][y].filterIt(it.color != X[x,y]).mapIt(it.distortion)
      if d.len <= 0 : continue
      minR .min= d.min()
      maxR .max= d.min()
  for x in 0..<X.w:
    for y in 0..<X.h:
      let d = DB[x][y].filterIt(it.color != X[x,y]).mapIt(it.distortion)
      var r = 255 # 変更不能な場合は 255なので！
      if d.len >= 1:
        r = (255.0 * (d.min - minR) / (maxR - minR)).int
      # r が大きいほど変えにくい
      img[x+2,y+2].all = r
  return img
proc withDiffx10(S,C:Image): Image =
  let D = S.distortionMap()
  result = initImage(S.w*10,S.h*10)
  for x in 0..<S.w:
    for y in 0..<S.h:
      for xi in 0..<10:
        for yi in 0..<10:
          if x mod 2 == y mod 2 :
            result[x*10+xi,y*10+yi] = D[x,y]
          else:
            result[x*10+xi,y*10+yi] = [255.uint8,255,255]
      for xi in 0..<8:
        for yi in 0..<8:
          result[x*10+xi+1,y*10+yi+1] = C[x,y]
      for xi in 0..<6:
        for yi in 0..<6:
          result[x*10+xi+2,y*10+yi+2] = S[x,y]
# デコード
proc crmiDotDecode(image:Image) :seq[int]=
  var X = initImage(image.w-4,image.h-4)
  for x in 2..<image.w-2:
    for y in 2..<image.h-2:
      X[x-2,y-2] = image[x,y]
  var EX = newSeq[int]()
  var XREP = image.representationMap()
  var r1 = initRand(1234)
  let R = newSeqWith(X.w,newSeqWith(X.h,r1.rand(0..1)))
  for x in 0..<X.w:
    for y in 0..<X.h:
      if x mod 2 != y mod 2 : continue
      if dp4.allIt(image[it+(x+2,y+2)] == image[x+2-1,y+2]): continue
      # 代表色を探して,0,1を判定して,シャッフルしてEXを作って戻す
      var v = R[x][y]
      if XREP[x,y] == X[x,y]: v = v xor 1
      EX.add v
  r1 = initRand(1234)
  r1.shuffle(EX)
  # これをデコードすれば
  return EX
# 埋め込み
proc crmiDotEmbed*(image:Image,M:seq[int],saveDir:string) :
  tuple[stego:Image,pSNR:float,fixedPixelCount:int] =
  let (D,X,XREP) = image.distortionScoreMap()
  var S = newSeq[tuple[pos:tuple[x,y:int],color:Color,x:int,d:float]]()
  # ランダム要素は マスクと,シャッフル位置だけ.
  var r1 = initRand(1234)
  let R = newSeqWith(X.w,newSeqWith(X.h,r1.rand(0..1)))
  for x in 0..<X.w:
    for y in 0..<X.h:
      # 近傍が変化しない,という制約をつけた
      # ↑の効果で近隣4色は変化しないことが保証されているので一様そうな場所は無視して良い.
      if x mod 2 != y mod 2 : continue
      if dp4.allIt(image[it+(x+2,y+2)] == image[x+2-1,y+2]): continue
      # 近隣で一番同じ色が多く,かつ左上から時計回りに見て初めて合ったもの = 0
      # 他 = 1
      # つまり,雑魚色から雑魚色には変わらない.
      # 違法な色としてとりあえずマゼンタをおいておく
      var v = R[x][y]
      var c : Color = [255.uint8,0.uint8,255.uint8]
      # 違法な歪みとしてやばい値をおいておく
      var dist = INF
      # 一番 distortionが低くかつ自身と異なる色かつparityが違うものについて
      # そのparityを保存する
      let selfIsRepresentColor = X[x,y] == XREP[x,y]
      let dds = D[x][y].filterIt(it.color == XREP[x,y])
      if not selfIsRepresentColor:
        # 代表色に変えるしかない
        let dd = dds[0]
        doAssert dd.color != X[x,y]
        dist = dd.distortion
        c = dd.color
      else:
        # 雑魚色に変える場合は気にする必要はない.parityは1になる
        for dd in D[x][y].sortedByIt(it.distortion):
          if dd.color == X[x,y]: continue
          dist = dd.distortion
          c = dd.color
          v = v xor 1
          break
      S.add(((x,y),c,v,dist))
  r1 = initRand(1234)
  r1.shuffle(S)
  let SP = S.mapIt(it.pos) # position
  let SC = S.mapIt(it.color) # color
  let SX = S.mapIt(it.x) # 0 or 1
  let SD = S.mapIt(it.d) # distortion
  let n = SX.len
  let m = M.len
  const h = 10
  echo n,"pixels exists"
  let XX = newSeqWith(n,@[0,1])
  let DD = toSeq(0..<n).mapIt((var t = @[SD[it],SD[it]];t[SX[it]]=0;t))
  let EX = stcEmbed(M,SX,XX,XX,DD,h) # 0-1 embeded
  let M2 = stcExtract(EX,m,h)
  stdout.write "X : ";plotDiff(SX,EX) # ステゴオブジェクトともとのとの違い
  stdout.write "M : ";plotDiff(M,M2) # 再構成したメッセージが同一か
  # 再構成する
  var diffImage = X.deepCopy()
  for i in 0..<diffImage.data.len:
    let d = diffImage.data[i]
    let gb = 192u8 + uint8( (d.r + d.g + d.b) div 12 )
    diffImage.data[i] = [gb,gb,gb]
  var stegoImage = image.deepCopy()
  var ifAllChanged = X.deepCopy
  for i in 0..<EX.len:
    ifAllChanged[SP[i]] = SC[i]
    if EX[i] == SX[i] : continue
    diffImage[SP[i]] = SC[i]
    stegoImage[SP[i] + (2,2)] = SC[i]
  let EX2 = stegoImage.crmiDotDecode()
  stdout.write "EX : ";plotDiff(EX,EX2) # 読み取ったBit列に誤りがないか
  X.distortionMap.savePNGx10(fmt"{saveDir}/distortion.png")
  X.withDiffx10(ifAllChanged).savePNG(fmt"{saveDir}/distortion2.png")
  stegoImage.savePNGx10(fmt"{saveDir}/embed.png")
  image.savePNGx10(fmt"{saveDir}/embedbase.png")
  diffImage.savePNGx10(fmt"{saveDir}/embedmap.png")
  let fixedPixelCount = toSeq(0..<SX.len).mapIt(abs(SX[it] - EX[it])).sum()
  return (stegoImage,pSNR(image,stegoImage),fixedPixelCount)

# x10されているマーカーをもとにして埋め込む
proc embedToMarker(input:string,M:seq[int]) =
  let baseImage = input.loadImage()
  var markerBaseImage = initImage(baseImage.w div 10 - 8,baseImage.h div 10 - 8)
  for x in 0..<markerBaseImage.w:
    for y in 0..<markerBaseImage.h:
      markerBaseImage[x,y] = baseImage[45 + 10 * x ,45 + 10 * y]
  let (stego,_,_) = markerBaseImage.crmiDotEmbed(M,"./output/marker")
  markerBaseImage.savePNGx10("output/embase.png")
  stego.savePNGx10("output/emstego.png")
  stego.vividGradation(1.0).toMarker(2).savePNGx10("output/emarker.png")

if isMainModule:
  let input = commandLineParams()[0]
  let saveDir = fmt"./output/{input.splitFile().name}"
  let image = input.loadImage()
  echo image.getColorPalette()
  let M = newSeqWith(int(0.01*float(image.w*image.h)),rand(0..1))
  let (stego,_,_) = image.crmiDotEmbed(M,saveDir)
  # image.savePNGx10("239i.png")
  # stego.savePNGx10("239w.png")
  # - 231 / 123
  # input.embedToMarker(M)
  # stego.vividGradation(1.0).trimOuter().toMarker(2).savePNGx10(fmt"{saveDir}/embedMarker.png")
