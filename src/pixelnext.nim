import sequtils,tables,algorithm,random,os,strutils,sets,math
import ../lib/[image]
import ./util
import ./few2002
import ./crmidot


proc walkPixelArtDir(baseDirname:string) =
  var nameToPath = initTable[string,string]()
  proc impl(dirname:string) =
    for dir in dirname.walkDirRec(yieldFilter = {pcDir}):
      dir.impl()
    for f in dirname.walkDirRec(yieldFilter = {pcFile}):
      # if not f.endsWith(".bmp"): continue
      # if f.endsWith("r.bmp"): continue
      # if f.endsWith("r2.bmp"): continue
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
  # echo infoSeq
  # echo infoSeq.len," 枚"
  let size = 48
  var piccnt = 0
  for info in infoSeq:
    let (_,name,_) = info.path.splitFile()
    let image = info.path.loadImage()
    var diffs = newSeq[int]()
    proc getD(c1,c2:Color):int =
      abs(c1.r - c2.r) + abs(c1.g - c2.g) + abs(c1.b - c2.b)
    var minD = 1e12.int
    var zerocnt = 0
    var cnt = 0
    for x in 0..<image.w:
      for y in 0..<image.h:
        if x > 0:
          let d = getD(image[x,y],image[x-1,y])
          if d > 0 : minD = minD.min(d)
          else: zerocnt += 1
          cnt += 1
        if y > 0:
          let d = getD(image[x,y],image[x,y-1])
          if d > 0 : minD = minD.min(d)
          else: zerocnt += 1
          cnt += 1
    # 0 の割合
    # diff の
    # if minD < 10:
      # echo info.path
    echo minD,",",zerocnt,",",cnt


if isMainModule:
  commandLineParams()[0].walkPixelArtDir()
