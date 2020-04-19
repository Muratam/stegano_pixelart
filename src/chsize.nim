{.checks:off.}
import strutils,sequtils,strformat,hashes,tables,algorithm,sets,math,os,random
import ../lib/[image]
import ./util

proc padding(image:Image,w,h:int):Image =
  doAssert w >= image.w and h >= image.h
  result = initImage(w,h)
  for x in 0..<w:
    for y in 0..<h:
      result[x,y] = [255u8,255u8,255u8]
  for x in 0..<image.w:
    for y in 0..<image.h:
      result[x,y] = image[x,y]

# proc convineAll(all:seq[Image]) : Image =


proc makeImages(image:Image) =
  # 56x56
  let w = image.w div 10
  let h = image.h div 10
  var all = newSeq[Image]()
  for size in [1,2,4,8,16]:
    var made = initImage(w*size,h*size)
    for x in 0..<w:
      for y in 0..<h:
        let c = image[x*10,y*10]
        for xi in 0..<size:
          for yi in 0..<size:
            made[x*size+xi,y*size+yi] = c
    all &= made
    made = made.padding(1000,1000)
    made.savePNG("./print/xx" & ($size) & ".png")




if isMainModule:
  commandLineParams()[0].loadImage().makeImages()
