{.checks:off.}
import strutils,sequtils,strformat,hashes,tables,algorithm,sets,math,os,random
import ../lib/[image]
import ./util
import crmidot
# ディレクトリを走査して,枚数とサイズと色数の統計を取る
# マーカーは,48x48(=>56x56)で固定. 180枚の画像.
# アフィン変換して 560*560にして処理
proc clip(image:Image,xr,yr:Slice[int]):Image =
  result = initImage(xr.b-xr.a+1,yr.b-yr.a+1)
  for x in 0..<result.w:
    for y in 0..<result.h:
      result[x,y] = image[xr.a+x,yr.a+y]


proc walkPixelArtDir(baseDirname:string) =
  var nameToPath = initTable[string,string]()
  proc impl(dirname:string) =
    for dir in dirname.walkDirRec(yieldFilter = {pcDir}):
      dir.impl()
    for f in dirname.walkDirRec(yieldFilter = {pcFile}):
      if not f.endsWith(".bmp"): continue
      if f.endsWith("r.bmp"): continue
      if f.endsWith("r2.bmp"): continue
      let (_,name,_) = f.splitFile()
      nameToPath[name] = f
  baseDirname.impl()
  let pathPairs = toSeq(nameToPath.pairs)
  let pathes = pathPairs.sortedByIt(it[0]).mapIt(it[1])
  type Info = tuple[colorNum,w,h:int,path:string]
  var infoSeq = newSeq[Info]()
  for i,p in pathes:
    let image = p.loadImage()
    infoSeq &= (image.getColorPalette().len,image.w,image.h,p)
  echo infoSeq
  echo infoSeq.len," 枚"
  let size = 48
  var piccnt = 0
  for info in infoSeq:
    let (_,name,_) = info.path.splitFile()
    echo name
    let image = info.path.loadImage()
    for x in 0..<(image.w-1) div size:
      for y in 0..<(image.h-1) div size:
        let xr = x*size..<(x+1)*size
        let yr = y*size..<(y+1)*size
        if xr.b >= image.w: continue
        if yr.b >= image.h: continue
        let clipped = image.clip(xr,yr)
        let palette = clipped.getColorTable()
        if toSeq(palette.values).sorted(cmp)[^1] > int(size.float * size.float * 0.75):
          continue
        clipped.embedOuter(size,size).toMarker(2).savePNGx10(fmt"./nn/datasetgamma1nonvivid/{name}-{x}-{y}.png")
        piccnt += 1
  echo piccnt
if isMainModule:
  commandLineParams()[0].walkPixelArtDir()
