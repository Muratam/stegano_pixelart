# crmiLTP のみ管理. 色を区別するが,近さとかは管轄外
import hashes,tables,algorithm,math,sequtils
import image

const W* = {
  1:1.5691,  57:1.1864,  31:1.1385,   2:0.7880,
  10:0.7293,  11:0.6203,  14:0.5586,  46:0.5159,  63:0.5041,
  61:0.3367,  19:0.3278,  23:0.3224,   0:0.2490,  27:0.2080,
  42:0.2016, 191:0.1804, 175:0.1634,  17:0.1581,
  127:0.1341,255:1.2955
}.toTable()
const keyOfW* = (proc():seq[int]=toSeq(W.keys))()
const crmiDP = (proc():seq[int]=
  let n = 256
  result = newSeq[int](n)
  let dir7 = toSeq(0..7)
  for i in 0..<n:
    let I = toSeq(0..7).mapIt(int(((1 shl it) and i) > 0))
    var ans = 1e12.int
    for b in countup(0,6,2):
      ans = ans.min dir7.mapIt(I[ (it + b) mod 8] * (1 shl it)).sum()
      ans = ans.min dir7.mapIt(I[ (65536 - it - b) mod 8] * (1 shl it)).sum()
    result[i] = ans
)()
# 近隣8色のいずれかに変化させると考える。
# その色を黒,他の色は全て白としてcrmiを実行する
type CrmiAndColor* = tuple[crmi:int,color:Color]
type DistAndColor* = tuple[distortion:float,color:Color]
const dP* : seq[Pos]= @[(0,-1),(1,-1),(1,0),(1,1),(0,1),(-1,1),(-1,0),(-1,-1)]
const dP4* : seq[Pos]= @[(0,-1),(1,0),(0,1),(-1,0)]
proc toI*(x:Color):int = (x.r shl 16) xor (x.g shl 8) xor x.b
proc toC*(x:int):Color = [((x shr 16) and 0xff).uint8,((x shr 8) and 0xff).uint8,(x and 0xff).uint8]
# その2色にのみ注目し、他の色の場合は無効にするとか？
# 同一色かどうかで2値化するLTP.
proc crmiLTPImpl(image:Image,x,y:int,checkColor:Color): int =
  var xx = image[x,y] == checkColor
  for i,d in dP:
    result += (xx xor (image[d+(x,y)] == checkColor)).int shl i
proc crmiLTP*(image:Image,x,y:int,checkColor:Color): int =
  crmiDP[image.crmiLTPImpl(x,y,checkColor)]

# 近隣4色に変更した場合のcrmiを計算する
# 同じ色になってもいい
proc crmiLTPs*(image:Image,x,y:int):seq[CrmiAndColor] =
  assert x > 0 and y > 0 and x < image.w - 1 and y < image.h - 1
  let otherColors = dP4.mapIt(image[it+(x,y)].toI()).sorted(cmp).deduplicate(true).mapIt(it.toC())
  for mainColor in otherColors:
    let index = crmiLTP(image,x,y,mainColor)
    result &= (index,mainColor)

# 全ての箇所について crmiLTPs を計算
proc getAllCrmiLTP*(image:Image):seq[seq[seq[CrmiAndColor]]] =
  result = newSeqWith(image.w,newSeqWith(image.h,newSeq[CrmiAndColor]()))
  for x in 1..<image.w-1:
    for y in 1..<image.h-1:
      result[x][y] = image.crmiLTPs(x,y)
