import sequtils,tables,algorithm,random,os
import ../lib/[image]
import ./util
template `max=`*(x,y) = x = max(x,y)
template `min=`*(x,y) = x = min(x,y)

proc check(image:Image,x,y:int):tuple[level:int,color:Color,another:Color] =
  const Invalid = (-1,[0u8,0u8,0u8],[0u8,0u8,0u8])
  var colors = newSeq[Color]()
  for xi in x..x+2:
    for yi in y..y+2:
      if xi == x + 1 and yi == y + 1 : continue
      colors &= image[xi,yi]
  var ct = toSeq(colors.toCountTable().pairs)
  ct = ct.sortedByIt(-it[1])
  if ct[0][1] > 5: return Invalid
  if ct[0][1] < 3: return Invalid
  proc isSame(color:Color,poses:seq[tuple[x,y:int]]): bool =
    proc check(f:proc(b:tuple[x,y:int]):tuple[x,y:int]) : bool =
      for (xb,yb) in poses:
        let (xi,yi) = f((xb,yb))
        if image[x+xi,y+yi] != color: return false
      return true
    for f in @[
        proc(b:tuple[x,y:int]):tuple[x,y:int] = (b.x,b.y),
        proc(b:tuple[x,y:int]):tuple[x,y:int] = (2-b.x,b.y),
        proc(b:tuple[x,y:int]):tuple[x,y:int] = (b.x,2-b.y),
        proc(b:tuple[x,y:int]):tuple[x,y:int] = (2-b.x,2-b.y),
        proc(b:tuple[x,y:int]):tuple[x,y:int] = (b.y,b.x),
        proc(b:tuple[x,y:int]):tuple[x,y:int] = (2-b.y,b.x),
        proc(b:tuple[x,y:int]):tuple[x,y:int] = (b.y,2-b.x),
        proc(b:tuple[x,y:int]):tuple[x,y:int] = (2-b.y,2-b.x),
    ]:
      if check(f): return true
    return false
  for i,(color,count) in ct:
    var ok = false
    if count == 5:
      ok = ok or color.isSame(@[(0,0),(1,0),(2,0),(0,1),(0,2)])
      ok = ok or color.isSame(@[(0,0),(1,0),(2,0),(0,1),(2,1)])
      ok = ok or color.isSame(@[(0,0),(1,0),(2,0),(0,2),(2,1)])
    elif count == 4:
      ok = ok or color.isSame(@[(0,0),(1,0),(2,0),(0,1)])
    elif count == 3:
      ok = ok or color.isSame(@[(0,0),(1,0),(2,0)])
      ok = ok or color.isSame(@[(0,0),(1,0),(0,1)])
      ok = ok or color.isSame(@[(1,0),(0,1),(0,2)])
    if not ok: continue
    # 色を変更するので問題なし
    if image[x+1,y+1] != color :
      return (count,color,color)
    if i == 0:
      return (count,color,ct[1][0])
    else:
      return (count,color,ct[0][0])
  return Invalid




proc few2002Embed*(image:Image,M:seq[int]):
    tuple[pSNR:float,fixedPixelCount:int] =
  # echo image.getColorPalette()
  # const wetChannel = [20u8, 20u8, 20u8]
  # const wetChannel = [0u8,0u8,0u8]
  var levels = newSeqWith(image.w div 4,newSeqWith(image.h div 4,(-1,[0u8,0u8,0u8])))
  # 一旦3x3毎にブロックを分ける
  var targets = newSeq[tuple[x,y,level:int,color:Color]]()
  for xi in 0.countup(image.w-1,4):
    for yi in 0.countup(image.h-1,4):
      var valids = newSeq[tuple[x,y,level:int,color:Color]]()
      for (x,y) in @[(xi,yi),(xi+1,yi),(xi,yi+1),(xi+1,yi+1)]:
        if x + 2 >= image.w or y + 2 >= image.h : continue
        let (level,color,another) = image.check(x,y)
        if level > 0 :
          # if another != wetChannel and image[x+1,y+1] != wetChannel:
          valids &= (x+1,y+1,level,another)
      if valids.len == 0 : continue
      valids = valids.sortedByIt(-it.level)
      block:
        let (x,y,level,color) = valids[0]
        levels[xi div 4][yi div 4] = (level,color)
        targets &= (x,y,level,color)
  targets = targets.sortedByIt(-it.level)
  block:
    var t5 = targets.filterIt(it.level == 5)
    t5.shuffle()
    var t4 = targets.filterIt(it.level == 4)
    t4.shuffle()
    var t3 = targets.filterIt(it.level == 3)
    t3.shuffle()
    targets = t5.concat(t4).concat(t3)
  var stego = image.deepCopy()
  var diffImage = image.deepCopy()
  for i in 0..<diffImage.data.len:
    let d = diffImage.data[i]
    let gb = 192u8 + uint8( (d.r + d.g + d.b) div 12 )
    diffImage.data[i] = [gb,gb,gb]
  var cnt = 0
  for mi,(x,y,level,color) in targets:
    if mi >= M.len: break
    if M[mi] == 1 :
      stego[x,y] = color
      diffImage[x,y] = color
      cnt += 1
  return (pSNR(stego,image),cnt)
  # echo M.len, " bit for ",cnt ,"/",(image.w*image.h), " = ", cnt.float / (image.w*image.h).float
  # echo "PSNR:",pSNR(stego,image)
  # stego.savePNGx10("./fcstego.png")
  # diffImage.savePNGx10("./fdiff.png")
  # image.savePNGx10("./fcover.png")


if isMainModule:
  let input = commandLineParams()[0]
  let image = input.loadImage()
  let M = newSeqWith(int(float(image.w * image.h) * 0.01),rand(0..1))
  discard image.few2002Embed(M)
