{.checks:off.}
import strformat,strutils,sequtils,hashes,tables,algorithm,sets,math,os,random,times
import ../lib/[image]
import ./util
template blockStopwatch(body) =
  let t1 = cpuTime()
  block: body
  stderr.writeLine "TIME:",(cpuTime() - t1) * 1000,"ms"

# ドット絵を1秒くらいで読み取れる.
# 補助 : vividColor(=色の正規化(人によって色使いの癖がことなるのを防ぐ))
# 制約 : 56x56(from 48x48). 安定して読み取れる
# めも :
#   http://www.vc.media.yamanashi.ac.jp/docs/2012/Becode_IEICEJA2012.pdf
#   BECODEと比較して、誤差に強い気がする(というかあれは(斜めになっている)エッジにしか埋め込めない)
#   普通のARマーカーと違って,殆ど同じ絵を並べた時に全く異なる情報が読み取れる

proc toU8(x:int):uint8 =
  if x < 0 : return 0.uint8
  if x > 255: return 255.uint8
  return x.uint8
proc median(colors:seq[Color]):Color =
  var rgbs = [newSeq[int](),newSeq[int](),newSeq[int]()]
  for color in colors:
    for i in 0..<3:
      rgbs[i] &= color[i].int
  var rgb = [0,0,0]
  for i in 0..<3:
    rgb[i] = rgbs[i].sorted(cmp)[rgbs[i].len div 2]
  return [rgb[0].toU8,rgb[1].toU8,rgb[2].toU8]
proc average(colors:seq[Color]):Color =
  var rgb = [0,0,0]
  for color in colors:
    for i in 0..<3:
      rgb[i] += color[i].int
  for i in 0..<3:
    rgb[i] = rgb[i] div len(colors)
  return [rgb[0].toU8,rgb[1].toU8,rgb[2].toU8]
proc getRGBDiff(c1,c2:Color): float =
  return math.sqrt(float(
    (c1.r - c2.r) * (c1.r - c2.r) +
    (c1.g - c2.g) * (c1.g - c2.g) +
    (c1.b - c2.b) * (c1.b - c2.b)
  ))
proc getDiff(c1,c2:Color): float =
  # return getRGBDiff(c1,c2)
  return distanceByCIEDE2000(c1,c2)
  # let x1 = (c1[0],c1[1],c1[2]).rgb2xyz().xyz2lab()
  # let x2 = (c2[0],c2[1],c2[2]).rgb2xyz().xyz2lab()
  # return math.sqrt(
  #   (x1[0]-x2[0])*(x1[0]-x2[0])+
  #   (x1[1]-x2[1])*(x1[1]-x2[1])+
  #   (x1[2]-x2[2])*(x1[2]-x2[2])
  # )
type Rect = tuple[x,y:Slice[int]]
proc getRect(lt,rb:Pos2D[int],rate:float = 0.0): Rect =
  let lx = (lt.x.float * (1.0-rate) + rb.x.float * rate).int
  let rx = (lt.x.float * rate + rb.x.float * (1.0-rate)).int
  let ty = (lt.y.float * (1.0-rate) + rb.y.float * rate).int
  let by = (lt.y.float * rate + rb.y.float * (1.0-rate)).int
  return (lx..rx,ty..by)
proc getColors(image:Image,rect:Rect):seq[Color] =
  var colors = newSeq[Color]()
  for ix in rect.x:
    for iy in rect.y:
      colors &= image[ix,iy]
  return colors
type Rgb = tuple[r,g,b:float]
proc `+`(x,y:Rgb) : Rgb = (x.r+y.r,x.g+y.g,x.b+y.b)
proc `-`(x,y:Rgb) : Rgb = (x.r-y.r,x.g-y.g,x.b-y.b)

# 写真をドット絵として解釈
# 1: 一様な場所が手に入るので、その分散(の95%)以下ならマージして良いとしてマージ.
# 2: マージされた隣接の中で、もっとも色の差が激しかったものをしきい値として、その差以下ならマージ
var tmpVars = newSeq[float]()
var sucVars = newSeq[float]()
type MergeDiffInfo = tuple[neighborWorst,nonNeighborBest:float]
proc parsePixelArtImpl(image:Image,w,h:int,isCheckRGB:bool): tuple[pixelImage,analysisImage:Image,rate:float] =
  var rgbSumMap = newSeqWith(image.w+1,newSeq[Rgb](image.h+1))
  var rgbSumSqMap = newSeqWith(image.w+1,newSeq[float](image.h+1))
  for x in 1..image.w:
    for y in 1..image.h:
      let c = image[x-1,y-1]
      let (r,g,b) = (c.r.float,c.g.float,c.b.float)
      rgbSumMap[x][y] = (r,g,b) + rgbSumMap[x-1][y] + rgbSumMap[x][y-1] - rgbSumMap[x-1][y-1]
      rgbSumSqMap[x][y] = (r*r+g*g+b*b) + rgbSumSqMap[x-1][y] + rgbSumSqMap[x][y-1] - rgbSumSqMap[x-1][y-1]
  proc getVariance(rect:Rect) : float =
    let rx = 0.max(rect.x.a)..<image.w.min(rect.x.b+1)
    let ry = 0.max(rect.y.a)..<image.h.min(rect.y.b+1)
    let cnt = float((rx.b - rx.a + 1) * (ry.b - ry.a + 1))
    let rgbSqSum =
      rgbSumSqMap[rx.b+1][ry.b+1] - rgbSumSqMap[rx.a][ry.b+1] -
      rgbSumSqMap[rx.b+1][ry.a] + rgbSumSqMap[rx.a][ry.a]
    let rgbsum =
      rgbSumMap[rx.b+1][ry.b+1] - rgbSumMap[rx.a][ry.b+1] -
      rgbSumMap[rx.b+1][ry.a] + rgbSumMap[rx.a][ry.a]
    var diffsum = rgbSqSum / cnt
    diffsum -= (rgbsum.r*rgbsum.r+rgbsum.g*rgbsum.g+rgbsum.b*rgbsum.b) / (cnt * cnt)
    return diffsum
  let iw = image.w
  let ih = image.h
  let rw = int(image.w.float /  w.float)
  let rh = int(image.h.float /  h.float)
  proc getLatticeMatrix(): seq[seq[Pos2D[int]]] =
    result = newSeqWith(w+1,newSeqWith(h+1,(0,0)))
    for x in 0..w:
      for y in 0..h:
        result[x][y] = (x * iw div w,y * ih div h)
  let latticeMatrix = getLatticeMatrix()
  proc getVarMinRectMap(image:Image):seq[seq[tuple[lt,rb:Pos2D[int]]]] =
    result = newSeqWith(w,newSeq[tuple[lt,rb:Pos2D[int]]](h))
    for x in 0..<w:
      for y in 0..<h:
        var lt = latticeMatrix[x][y]
        var rb = latticeMatrix[x+1][y+1]
        let rectMinW =  (rb.x - lt.x) div 2
        let rectMinH =  (rb.y - lt.y) div 2
        var nowVar = getRect(lt,rb).getVariance()
        var dirty = false
        proc update():bool =
          let nextVar = getRect(lt,rb).getVariance()
          result = nextVar < nowVar
          if result:
            dirty = true
            nowVar = nextVar
        while true:
          dirty = false
          if rb.y - lt.y >= rectMinH:
            lt.y += 1
            if not update() : lt.y -= 1
          if rb.x - lt.x >= rectMinW:
            lt.x += 1
            if not update() : lt.x -= 1
          if rb.y - lt.y >= rectMinH:
            rb.y -= 1
            if not update() : rb.y += 1
          if rb.x - lt.x >= rectMinW:
            rb.x -= 1
            if not update() : rb.x += 1
          if not dirty: break
        result[x][y] = ( (0.max(lt.x),0.max(lt.y)), ((image.w-1).min(rb.x),(image.h-1).min(rb.y)) )
  let varMinRectMap = image.getVarMinRectMap()
  proc xyToI(x,y:int):int = y*w+x
  proc iToXY(i:int):(int,int) = (i mod w,i div w)
  type SizeAndColor = tuple[size:int,color:Color]
  var pixelImage = initImage(w,h)
  proc makeAnalysisImage(pixelImage:Image) : Image =
    result = image.deepCopy()
    for ix in 0..<w:
      for iy in 0..<h:
        let lx = ix * image.w div w
        let ly = iy * image.h div h
        for x in lx-1..lx+1:
          for y in ly-1..ly+1:
            if x >= 0 and y >= 0 and x < result.w and y < result.h:
              result[x,y] = [0u8,255u8,0u8]
    for lx in 0..<latticeMatrix.len:
      for ly in 0..<latticeMatrix[lx].len:
        if lx < varMinRectMap.len and ly < varMinRectMap[lx].len:
          let (lt,rb) = varMinRectMap[lx][ly]
          proc update(image:Image,x,y:int) =
            image[x,y].r = 255.min(image[x,y].r + 20)
            image[x,y].g = 255.min(image[x,y].g + 20)
            image[x,y].b = 255.min(image[x,y].b + 20)
          for ix in lt.x..rb.x:
            result.update(ix,lt.y)
            result.update(ix,rb.y)
          for iy in lt.y..rb.y:
            result.update(lt.x,iy)
            result.update(rb.x,iy)
        let (x,y) = latticeMatrix[lx][ly]
        for ix in x-1..x+1:
          for iy in y-1..y+1:
            if ix >= 0 and iy >= 0 and ix < iw and iy < ih:
              result[ix,iy] = [0.uint8,0.uint8,255.uint8]
        if lx < w and ly < h:
          if lx > 0 and pixelImage[lx,ly] != pixelImage[lx-1,ly]:
            for iy in y..y+rh:
              result[x,iy] = [0.uint8,255.uint8,255.uint8]
          if ly > 0 and pixelImage[lx,ly] != pixelImage[lx,ly-1]:
            for ix in x..x+rw:
              result[ix,y] = [0.uint8,255.uint8,255.uint8]
  proc setUpUnionFindTree(image:Image): MonoidUnionFind[SizeAndColor] =
    var colors = newSeq[SizeAndColor](w*h)
    for x in 0..<w:
      for y in 0..<h:
        let (lt,rb) = varMinRectMap[x][y]
        pixelImage[x,y] = image.getColors(getRect(lt,rb)).median()
        colors[xyToI(x,y)] = (1,pixelImage[x,y])
    return colors.newMonoidUnionFind(
      proc(x,y:SizeAndColor):SizeAndColor =
        let size = x.size + y.size
        let r = x.color.r * x.size + y.color.r * y.size
        let g = x.color.g * x.size + y.color.g * y.size
        let b = x.color.b * x.size + y.color.b * y.size
        let ur = 0.max(255.min(r div size)).uint8
        let ug = 0.max(255.min(g div size)).uint8
        let ub = 0.max(255.min(b div size)).uint8
        return (size,[ur,ug,ub])
    )
  var uf = image.setUpUnionFindTree()
  # マージ (マーカーの外枠)
  proc mergeBorder() =
    for x in 0..<w:
      for y in [0,1,h-2,h-1]:
        uf.merge(xyToI(0,0),xyToI(x,y))
    for y in 0..<h:
      for x in [0,1,w-2,w-1]:
        uf.merge(xyToI(0,0),xyToI(x,y))
    for x in 2..<w-2:
      for y in [2,3,h-4,h-3]:
        uf.merge(xyToI(2,2),xyToI(x,y))
    for y in 2..<h-2:
      for x in [2,3,w-4,w-3]:
        uf.merge(xyToI(2,2),xyToI(x,y))
  mergeBorder()
  proc mergeByVariance() =
    var vars = newSeq[float]()
    for lx in 4..<varMinRectMap.len-4:
      for ly in 4..<varMinRectMap[lx].len-4:
        let (lt,rb) = varMinRectMap[lx][ly]
        vars &= getRect(lt,rb).getVariance()
    vars = vars.sorted(cmp)
    tmpVars = vars
    let per = commandLineParams()[1].parseInt() # 90,95,99,100 での結果を示す
    let midVar = vars[(vars.len-1).min(vars.len * per div 100)]
    proc isLeftSame(image:Image,x,y:int) : bool =
      let (alt,arb) = varMinRectMap[x][y]
      let (blt,brb) = varMinRectMap[x-1][y]
      let t = (alt.y + blt.y) div 2
      let b = (arb.y + brb.y) div 2
      let l = brb.x
      let r = alt.x
      let v2 = getRect((l,t),(r,b)).getVariance()
      result = v2 < midVar
    proc isTopSame(image:Image,x,y:int) : bool =
      let (alt,arb) = varMinRectMap[x][y]
      let (blt,brb) = varMinRectMap[x][y-1]
      let l = (alt.x + blt.x) div 2
      let r = (arb.x + brb.x) div 2
      let t = brb.y
      let b = alt.y
      let v2 = getRect((l,t),(r,b)).getVariance()
      result = v2 < midVar
    proc isLeftTopRectSame(image:Image,x,y:int) : bool =
      let (_,arb) = varMinRectMap[x][y]
      var (_,lt) = varMinRectMap[x-1][y-1]
      let (_,t) = varMinRectMap[x][y-1]
      let (_,l) = varMinRectMap[x-1][y]
      lt.y = lt.y.min(t.y)
      lt.x = lt.x.min(l.x)
      let rb = arb # ((alt.x + arb.x) div 2,(alt.y + arb.y) div 2)
      let v2 = getRect(lt,rb).getVariance()
      result = v2 < midVar
    for x in 0..<w:
      for y in 0..<h:
        if x > 0 and image.isLeftSame(x,y):
          uf.merge(xyToI(x,y),xyToI(x-1,y))
        if y > 0 and image.isTopSame(x,y):
          uf.merge(xyToI(x,y),xyToI(x,y-1))
        if x > 0 and y > 0 and image.isLeftTopRectSame(x,y):
          uf.merge(xyToI(x,y),xyToI(x,y-1))
          uf.merge(xyToI(x,y),xyToI(x-1,y))
          uf.merge(xyToI(x,y),xyToI(x-1,y-1))
  mergeByVariance()
  # block:
  #   var ii = pixelImage.deepCopy()
  #   for x in 0..<w:
  #     for y in 0..<h:
  #       let e = uf.rootElem(xyToI(x,y))
  #       ii[x,y] = e.color
  #   ii.makeAnalysisImage().savePNG("hoge.png")

  proc getWorstNeighborRGBDiff(): float =
    var avgDiffs = newSeq[float]()
    for x in 4..<pixelImage.w-4:
      for y in 4..<pixelImage.h-4:
        if x > 4 and uf.same(xyToI(x,y),xyToI(x-1,y)):
          let diff = getRGBDiff(pixelImage[x,y],pixelImage[x-1,y])
          avgDiffs &= diff
        if y > 4 and uf.same(xyToI(x,y),xyToI(x,y-1)):
          let diff = getRGBDiff(pixelImage[x,y],pixelImage[x,y-1])
          avgDiffs &= diff
    return avgDiffs.sorted(cmp)[^1]
  proc getWorstNeighborDiff(): float =
    var avgDiffs = newSeq[float]()
    for x in 4..<pixelImage.w-4:
      for y in 4..<pixelImage.h-4:
        if x > 4 and uf.same(xyToI(x,y),xyToI(x-1,y)):
          let diff = getDiff(pixelImage[x,y],pixelImage[x-1,y])
          avgDiffs &= diff
        if y > 4 and uf.same(xyToI(x,y),xyToI(x,y-1)):
          let diff = getDiff(pixelImage[x,y],pixelImage[x,y-1])
          avgDiffs &= diff
    return avgDiffs.sorted(cmp)[^1]
  let worstRGBDiff = getWorstNeighborRGBDiff()
  let worstDiff = getWorstNeighborDiff()
  proc mergeNeighborByAverageColor() =
    for x in 4..<w-4:
      for y in 4..<h-4:
        # disp では CIEDEを参考にしたい...
        if x > 4:
          let diff1 = getRGBDiff(pixelImage[x,y],pixelImage[x-1,y])
          let diff2 = getDiff(pixelImage[x,y],pixelImage[x-1,y])
          if (isCheckRGB and diff1 < worstRGBDiff) or (not isCheckRGB and diff2 < worstDiff) :
            uf.merge(xyToI(x,y),xyToI(x-1,y))
        if y > 4:
          let diff1 = getRGBDiff(pixelImage[x,y],pixelImage[x,y-1])
          let diff2 = getDiff(pixelImage[x,y],pixelImage[x,y-1])
          if (isCheckRGB and diff1 < worstRGBDiff) or (not isCheckRGB and diff2 < worstDiff) :
            uf.merge(xyToI(x,y),xyToI(x,y-1))
  mergeNeighborByAverageColor()
  proc getMergeDiffInfo() : MergeDiffInfo =
    var neighborWorst = 0.0
    var nonNeighborBest = 1e12
    # 隣接の最悪と非隣接の最善を(avgcolorで)
    for x in 4..<w-4:
      for y in 4..<h-4:
        let i = xyToI(x,y)
        if x > 4:
          let j = xyToI(x-1,y)
          let diff = getRGBDiff(pixelImage[x,y],pixelImage[x-1,y])
          if uf.same(i,j):
            neighborWorst = neighborWorst.max(diff)
          else:
            nonNeighborBest = nonNeighborBest.min(diff)
        if y > 4:
          let j = xyToI(x,y-1)
          let diff = getRGBDiff(pixelImage[x,y],pixelImage[x,y-1])
          if uf.same(i,j):
            neighborWorst = neighborWorst.max(diff)
          else:
            nonNeighborBest = nonNeighborBest.min(diff)
    if nonNeighborBest == 1e12: nonNeighborBest = -1e12
    return (neighborWorst,nonNeighborBest)
  let (neighborWorst,nonNeighborBest) = getMergeDiffInfo()
  # 色を揃える
  for x in 0..<w:
    for y in 0..<h:
      let e = uf.rootElem(xyToI(x,y))
      pixelImage[x,y] = e.color
  let analysisImage = pixelImage.makeAnalysisImage()
  return (pixelImage,analysisImage,nonNeighborBest / neighborWorst)

proc boxFilter3x3(image:Image):Image =
  result = image.deepCopy()
  for x in 1..<image.w-1:
    for y in 1..<image.h-1:
      result[x,y] = median(@[
        image[x-1,y-1],image[x,y-1],image[x+1,y-1],
        image[x-1,y],image[x,y],image[x+1,y],
        image[x-1,y+1],image[x,y+1],image[x+1,y+1],
      ])


# ガンマ値を適当に弄って
proc sameCheck*(resImage,valImage:Image) : int =
  var valImage = valImage
  doAssert valImage.w == resImage.w or valImage.w == resImage.w * 10
  doAssert valImage.h == resImage.h or valImage.h == resImage.h * 10
  if valImage.w > resImage.w:
    var tmp = initImage(resImage.w,resImage.h)
    for x in 0..<resImage.w:
      for y in 0..<resImage.h:
        tmp[x,y] = valImage[x*10,y*10]
    valImage = tmp
  for x in 4..<resImage.w-4:
    for y in 4..<resImage.h-4:
      if x > 4 and (
        (resImage[x,y] == resImage[x-1,y]) xor
        (valImage[x,y] == valImage[x-1,y])):
          result += 1
      if y > 4 and (
        (resImage[x,y] == resImage[x,y-1]) xor
        (valImage[x,y] == valImage[x,y-1])):
          result += 1

var bests = newSeq[int]()
var passedGammas = newSeq[float]()
proc parsePixelArt*(inputPath,valPath:string) : bool =
  var preRate = 0.0
  var preSuccess = false
  var preGamma = -1.0
  var bestSames = 1e10.int
  os.removeDir("output/gamma/")
  let inputImage = inputPath.loadImage()
  let valImage = valPath.loadImage()
  for i in 3..15:
    for isCheckRGB in [true,false]:
      let gamma = i.float / 10.0
      let (pixelImage,analysisImage,rate) =
          inputImage.applyGamma(gamma).boxFilter3x3().parsePixelArtImpl(56,56,isCheckRGB)
      pixelImage.savePNGx10(fmt"output/gamma/outpixel{i}-{isCheckRGB}.png")
      analysisImage.savePNG(fmt"output/gamma/outlines{i}-{isCheckRGB}.png")
      bestSames = bestSames.min(pixelImage.sameCheck(valImage))
      if rate > preRate:
        echo pixelImage.sameCheck(valImage)," : ",($rate&"    ")[0..4]," (",i,":",gamma,")"
        pixelImage.savePNGx10("output/gamma/aP.png")
        analysisImage.savePNG(fmt"output/gamma/aL.png")
        preRate = rate
        preGamma = gamma
        sucVars = tmpVars
        preSuccess = pixelImage.sameCheck(valImage) == 0
  let success = preSuccess and preRate >= 1.0
  if not success:
    bests &= bestSames
  else:
    passedGammas &= preGamma
  return success

# パースに失敗した場合 => もう一枚別の写真を取る (歪みやノイズが大きいせいで失敗した可能性)
# 成功した場合 => 多数決で境界を決める (evenな場所があればさらにγ値の幅を狭めて探索)


if isMainModule:

  stopwatch:
    var cnt = 0
    let target = commandLineParams()[0] # "disp" "print"
    let varTargetResultFile = fmt"plot/{target}.txt"
    if varTargetResultFile.existsFile():
      varTargetResultFile.removeFile()
    for i in 1..20:
      let inputPath = fmt"lastexpr/{target}/{i}.png"
      let valPath =  fmt"lastexpr/base/{i}.png"
      let ok = parsePixelArt(inputPath,valPath)
      if ok : cnt += 1
      echo cnt,"/20 (",i,")"
      if ok:
        let f = varTargetResultFile.open(fmAppend)
        f.writeLine ($sucVars)[1..^1] & ","
        f.close()
    echo bests # 最適なガンマ値でのやつ
    echo passedGammas # 通過したガンマ値
