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
  let f = open("result.txt",FileMode.fmWrite)
  defer: f.close()
  for info in infoSeq:
    let (_,name,_) = info.path.splitFile()
    let image = info.path.loadImage()
    let M = newSeqWith(int(float(image.w * image.h) * 0.01),rand(0..1))
    let (pSNR1,cnt1) = image.few2002Embed(M)
    let (_,pSNR2,cnt2) = image.crmiDotEmbed(M,"./output/crmi")
    f.writeLine name, ",", pSNR1,",",pSNR2,",",cnt1,",",cnt2,",",cnt1.float/(image.w*image.h).float,",",cnt2.float/(image.w*image.h).float
    echo name
    piccnt += 1
  echo piccnt


# if isMainModule:
#   commandLineParams()[0].walkPixelArtDir()


if isMainModule:
  let f = open("result.txt",FileMode.fmRead)
  defer: f.close()
  var pSNR1 = newSeq[float]()
  var pSNR2 = newSeq[float]()
  var cnt1 = newSeq[int]()
  var cnt2 = newSeq[int]()
  var emb1 = newSeq[float]()
  var emb2 = newSeq[float]()
  var cnt = 0
  for line in f.readAll().split("\n"):
    if line.len == 0 : continue
    let ls = line.split(",")
    if ls[0].parseFloat() == Inf: continue
    pSNR1 &= ls[0].parseFloat()
    pSNR2 &= ls[1].parseFloat()
    cnt1 &= ls[2].parseInt()
    cnt2 &= ls[3].parseInt()
    emb1 &= ls[4].parseFloat()
    emb2 &= ls[5].parseFloat()
    cnt += 1
  echo cnt
  echo pSNR1.sum() / cnt.float
  echo pSNR2.sum() / cnt.float
  echo cnt1.sum().float / cnt.float
  echo cnt2.sum().float / cnt.float
  echo emb1.sum() / cnt.float
  echo emb2.sum() / cnt.float
