{.checks:off.}
import strutils,sequtils,strformat,hashes,tables,algorithm,sets,math,os,random
import ../lib/[image]
import ./util
import random

if isMainModule:
  let filename = commandLineParams()[0]
  let image = filename.loadImage()
  var ched = image.deepCopy()
  let ww = 1
  for ix in countup(0,ched.w-1-ww,ww):
    for iy in countup(0,ched.h-1-ww,ww):
      if (ix div ww) mod 2 == (iy div ww) mod 2 : continue
      let ra = random.rand(0..1)
      for x in ix..<ix+ww:
        for y in iy..<iy+ww:
          if ra == 0:
            ched[x,y].r = ched[x,y].r + 10
            ched[x,y].g = ched[x,y].g + 10
          else:
            ched[x,y].r = ched[x,y].r - 10
            ched[x,y].g = ched[x,y].g - 10
  ched.savePNG(fmt"hoge{ww}.png")
