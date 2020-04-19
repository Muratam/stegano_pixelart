# import imageman
import stb_image/[read, write]
import tables,sets
import math
import os
import pnm

# https://github.com/brentp/nim-plotly
# https://github.com/SolitudeSF/imageman
# arraymancer は重い...
type
  Color* = array[3, uint8]
  Image* = ref object
    width*, height*: int
    data*: seq[Color]
  Pos* = tuple[x,y:int]
proc `+`*(a,b:Pos):Pos = (a.x+b.x,a.y+b.y)
template w*(i: Image): int = i.width
template h*(i: Image): int = i.height
template r*(c: Color): int = c[0].int
template g*(c: Color): int = c[1].int
template b*(c: Color): int = c[2].int
template `r=`*(c: var Color, i: int) = c[0] = i.uint8
template `g=`*(c: var Color, i: int) = c[1] = i.uint8
template `b=`*(c: var Color, i: int) = c[2] = i.uint8
template `r=`*(c: var Color, i: uint8) = c[0] = i
template `g=`*(c: var Color, i: uint8) = c[1] = i
template `b=`*(c: var Color, i: uint8) = c[2] = i
func `all=`*(c: var Color, i: int) = ( c.r = i; c.g = i; c.b = i )
func initImage*(w, h: Natural): Image =
  new(result)
  result.data = newSeq[Color](w * h)
  result.height = h
  result.width = w
func deepCopy*(image:Image):Image =
  new(result)
  result.data = image.data
  result.height = image.height
  result.width = image.width
func contains*(i: Image, x, y: int): bool =  x >= 0 and y >= 0 and x < i.height and y < i.width
template `[]`*(i: Image, x, y: int): Color =
  when defined(imagemanSafe):
    if i.contains(x, y): i.data[x + y * i.w]
  else: i.data[x + y * i.w]
template `[]`*(i: Image, xy:Pos): Color = i[xy.x,xy.y]
template `[]=`*(i: var Image, x, y: int, c: Color) =
  when defined(imagemanSafe):
    if i.contains(x, y): i.data[x + y * i.w] = c
  else: i.data[x + y * i.w] = c
template `[]=`*(i: var Image, xy: Pos, c: Color) =
  i[xy.x,xy.y] = c

# 色差関数
{.passC:"-I" & currentSourcePath().splitPath.head .}
proc ciede2000(l1, a1, b1, l2, a2, b2: float): float{.
    importc: "CIEDE2000" header: "./ciede2000.h".}

let rgb2xyz* = (proc() : proc (rgb: tuple[r, g, b: uint8]): tuple[x, y, z: float] =
  var rgb2xyzLinMap = newSeq[float](256)
  proc rgb2xyzLin(x: uint8): float =
    let nx = x.float / 255
    if nx > 0.04045: pow((nx+0.055)/1.055, 2.4)
    else: nx / 12.92
  for i in 0..<256: rgb2xyzLinMap[i] = rgb2xyzLin(i.uint8)
  proc rgb2xyzImpl(rgb: tuple[r, g, b: uint8]): tuple[x, y, z: float] =
    # http://w3.kcua.ac.jp/~fujiwara/infosci/colorspace/colorspace2.html
    let (r, g, b) = rgb
    let (lr, lg, lb) = (rgb2xyzLinMap[r], rgb2xyzLinMap[g], rgb2xyzLinMap[b])
    return (
      lr * 0.4124 + lg * 0.3576 + lb * 0.1805,
      lr * 0.2126 + lg * 0.7152 + lb * 0.0722,
      lr * 0.0193 + lg * 0.1192 + lb * 0.9505
    )
  return rgb2xyzImpl
)()
proc xyz2rgb*(xyz:tuple[x, y, z: float]): tuple[r, g, b: uint8] =
  proc lin(x: float): uint8 =
    return
      if x > 0.04045 / 12.92 :
        0.max(255.min(255.0 * (1.055 * pow(x, 1 / 2.4) - 0.055))).uint8
      else:
        0.max(255.min(255.0 * 12.92 * x)).uint8
  let (x,y,z) = xyz
  let (r,g,b) = (
     x * 3.2406 - y * 1.5372 - z * 0.4986,
    -x * 0.9689 + y * 1.8757 + z * 0.0415,
     x * 0.0557 - y * 0.2040 + z * 1.0570
  )
  return (r.lin,g.lin,b.lin)


proc rgb2gbr*(image:Image):Image =
  result = image.deepCopy()
  for x in 0..<image.w:
    for y in 0..<image.h:
      let c = result[x,y]
      result[x,y] = [c[1],c[2],c[0]]


proc xyz2lab*(xyz: tuple[x, y, z: float]): tuple[l, a, b: float] =
  # http://w3.kcua.ac.jp/~fujiwara/infosci/colorspace/colorspace3.html
  proc lin(x: float): float =
    if x > 0.008856: cbrt(x)
    else: 7.787 * x + 0.1379
  let (x, y, z) = xyz
  let (nx, ny, nz) = (lin(x / 0.95047), lin(y / 1.0), lin(z / 1.08883))
  return (116 * ny - 16, 500 * (nx - ny), 200 * (ny - nz))
proc lab2xyz*(lab: tuple[l, a, b: float]): tuple[x, y, z: float] =
  # http://w3.kcua.ac.jp/~fujiwara/infosci/colorspace/colorspace3.html
  proc lin(x: float): float =
    if x > 0.20690: pow(x, 3.0)
    else: 0.1282 * (x - 0.1379)
  let (l, a, b) = lab
  let fy = (l + 16.0) / 116.0
  let fx = fy + a / 500.0
  let fz = fy - b / 200.0
  return (fx.lin * 0.95047,fy.lin * 1.0 ,fz.lin * 1.08883)
proc applyGamma*(c:Color,gamma:float = 1.0):Color =
  var (xr,xg,xb) = (c[0],c[1],c[2])
  xr = 0.max(255.min(255 * (xr.float / 255).pow(1 / gamma))).uint8
  xg = 0.max(255.min(255 * (xg.float / 255).pow(1 / gamma))).uint8
  xb = 0.max(255.min(255 * (xb.float / 255).pow(1 / gamma))).uint8
  return [xr,xg,xb]
proc applyGamma*(image:Image,gamma:float = 1.0):Image =
  var G = newSeq[uint8](256)
  for i in 0..<G.len:
    G[i] = 0.max(255.min(255 * (i.float / 255).pow(1 / gamma))).uint8
  result = image.deepCopy()
  for x in 0..<result.w:
    for y in 0..<result.h:
      let c = result[x,y]
      result[x,y] = [G[c.r],G[c.g],G[c.b]]
# proc applyGamma*(c:Color,gamma:float = 1.0):Color =
#   var (l,a,b) = (c[0],c[1],c[2]).rgb2xyz().xyz2lab()
#   l = 0.0.max(100.0.min(100.0 * (l.float / 100.0).pow(1 / gamma)))
#   let (xr,xg,xb) = (l,a,b).lab2xyz().xyz2rgb()
#   return [xr,xg,xb]
# proc applyGamma*(image:Image,gamma:float = 1.0):Image =
#   result = image.deepCopy()
#   for x in 0..<result.w:
#     for y in 0..<result.h:
#       let c = result[x,y]
#       result[x,y] = c.applyGamma(gamma)

proc distanceByLab*(a, b: Color): float =
  let (l1,a1,b1) = (a[0],a[1],a[2]).rgb2xyz().xyz2lab()
  let (l2,a2,b2) = (b[0],b[1],b[2]).rgb2xyz().xyz2lab()
  return (l1-l2)*(l1-l2)+(a1-a2)*(a1-a2)+(b1-b2)*(b1-b2)
var ciede2000Table = initTable[tuple[a,b:Color],float]()
proc distanceByCIEDE2000*(a, b: Color): float =
  if (a,b) in ciede2000Table: return ciede2000Table[(a,b)]
  let (l1, a1, b1) = (a.r.uint8,a.g.uint8,a.b.uint8).rgb2xyz().xyz2lab()
  let (l2, a2, b2) = (b.r.uint8,b.g.uint8,b.b.uint8).rgb2xyz().xyz2lab()
  let distance = ciede2000(l1, a1, b1, l2, a2, b2)
  ciede2000Table[(a,b)] = distance
  return ciede2000Table[(a,b)]

# この値が高いほうが良い
proc pSNR*(a,b:Image):float =
  let n = a.data.len
  doAssert n == b.data.len
  var mse = 0.0
  for i in 0..<n:
    let ax = a.data[i]
    let bx = b.data[i]
    proc add(x,y:int) =
      mse += ((x-y)*(x-y)).float
    add(ax.r,bx.r)
    add(ax.g,bx.g)
    add(ax.b,bx.b)
  mse /= n.float * 3.0
  return 10 * log10(255*255*3 / mse)

proc rgbEuclidDistance*(a,b:Color):int =
  let rd = a.r - b.r
  let gd = a.g - b.g
  let bd = a.b - b.b
  return rd*rd+gd*gd+bd*bd

proc getColorTable*(img:Image):CountTable[Color] =
  var table = initCountTable[Color]()
  for x in 0..<img.w:
    for y in 0..<img.h:
      table.inc img[x,y]
  return table

proc getColorPalette*(img:Image):HashSet[Color] =
  var hashset = initHashSet[Color]()
  for x in 0..<img.w:
    for y in 0..<img.h:
      hashset.incl img[x,y]
  return hashset


# RGB の RGB 全てに同じ値(グレーなので)
proc loadPGM*(file:string) : Image =
  let pgm = readPGMFile(file)
  result = initImage(pgm.col,pgm.row)
  for i,d in pgm.data:
    result.data[i].r = d
    result.data[i].g = d
    result.data[i].b = d
proc savePGM*(image:Image,file:string) =
  var data = newSeq[uint8](image.data.len)
  for i,d in image.data:
    data[i] = uint8((d.r + d.g + d.b) div 3)
  discard existsOrCreateDir file.splitPath.head
  file.writePGMFile(newPGM(pgmFileDescriptorP5,image.w,image.h,data))


proc loadImage*(file: string): Image =
  if file.splitFile().ext == ".pgm":
    return file.loadPGM()
  # ↓ PNG
  var
    w, h, channels: int
    data = load(file, w, h, channels, 0)
  result = initImage(w, h)
  if channels == 3:
    copyMem addr result.data[0], addr data[0], data.len
    return
  if channels == 1:
    for i in 0..<w*h:
      result.data[i].r = data[i]
      result.data[i].g = data[i]
      result.data[i].b = data[i]
    return
  doAssert channels == 4
  for i in 0..<w*h:
    result.data[i].r = data[4*i]
    result.data[i].g = data[4*i+1]
    result.data[i].b = data[4*i+2]

proc savePNG*(image: Image, file: string, strides = 0) =
  createDir file.splitPath.head
  if not writePNG(file, image.w, image.h, RGB, cast[seq[byte]](image.data), strides):
    raise newException(IOError, "Failed to write the image to " & file)



# util
proc argMax*[T](arr:seq[T]):int =
  result = 0
  var val = arr[0]
  for i,a in arr:
    if a <= val: continue
    val = a
    result = i
proc argMin*[T](arr:seq[T]):int =
  result = 0
  var val = arr[0]
  for i,a in arr:
    if a >= val: continue
    val = a
    result = i

proc get8Dir*(image:Image,pos:Pos): seq[Pos] =
  result = @[]
  for dx in [-1,0,1]:
    let x = pos.x + dx
    if x < 0 or x >= image.w : continue
    for dy in [-1,0,1]:
      let y = pos.y + dy
      if y < 0 or y >= image.h : continue
      if x == pos.x and y == pos.y : continue
      result &= (x,y)


proc get9Dir*(image:Image,pos:Pos): seq[Pos] =
  result = @[]
  for dx in [-1,0,1]:
    let x = pos.x + dx
    if x < 0 or x >= image.w : continue
    for dy in [-1,0,1]:
      let y = pos.y + dy
      if y < 0 or y >= image.h : continue
      result &= (x,y)

proc allPos*(image:Image,ignoreEnd:bool = false):seq[Pos] =
  result = @[]
  if ignoreEnd:
    for x in 1..<image.w-1:
      for y in 1..<image.h-1:
        result &= (x,y)
  else:
    for x in 0..<image.w:
      for y in 0..<image.h:
        result &= (x,y)
