import strutils,sequtils,hashes,tables,algorithm,sets,math,os,heapqueue,deques
import image
import times
template stopwatch*(body) = (let t1 = cpuTime();body;stderr.writeLine "TIME:",(cpuTime() - t1) * 1000,"ms")

proc topologicalSort(E:seq[seq[int]]) : seq[int] =
  var visited = newSeq[int](E.len)
  var answer = newSeq[int]()
  proc visit(src:int) =
    visited[src] += 1
    if visited[src] > 1: return
    for dst in E[src]: visit(dst)
    answer.add(src) # 葉から順に追加される
  for src in 0..<E.len: visit(src)
  answer.reverse()
  return answer


# 先にキャッシュを作って色と色の差を計算する関数を生成する
proc makeColorDistanceFunction*(image:Image):proc(ic,jc:Color):float =
  var palette = image.getColorPalette()
  let paletteLen = palette.len
  var sortedColors = newSeq[Color]()
  block: # c0 は　一番暗い色
    let oldColors = toSeq(palette)
    let C = oldColors.sortedByIt((it.r.uint8,it.g.uint8,it.b.uint8).rgb2xyz().xyz2lab()[0])
    sortedColors &= C[0]
    palette.excl C[0]
  while palette.len > 0:
    var oldColors = toSeq(palette)
    let c = oldColors.sortedByIt(distanceByCIEDE2000(it,sortedColors[^1]))[0]
    sortedColors &= c
    palette.excl c
  var revSortedColors = initTable[Color,int]()
  for i,c in sortedColors: revSortedColors[c] = i
  var distanceCache = initTable[int,float]()
  return proc (ic,jc:Color):float =
    let i = revSortedColors[ic]
    let j = revSortedColors[jc]
    let k = i.min(j) * paletteLen + i.max(j)
    if k in distanceCache: return distanceCache[k]
    result = distanceByCIEDE2000(sortedColors[i],sortedColors[j])
    distanceCache[k] = result


# 外側を消す
proc trimOuter*(image:Image): Image =
  var (lo,ro,to,bo) = (0,0,0,0)
  # 枠を消す
  block:
    while true:
      if toSeq(0..<image.h).allIt(image[lo,it] == image[0,0]):
        lo += 1
      else: break
    while true:
      if toSeq(0..<image.w).allIt(image[it,to] == image[0,0]):
        to += 1
      else: break
    while true:
      if toSeq(0..<image.h).allIt(image[image.w-1-ro,it] == image[image.w-1,image.h-1]):
        ro += 1
      else: break
    while true:
      if toSeq(0..<image.w).allIt(image[it,image.h-1-bo] == image[image.w-1,image.h-1]):
        bo += 1
      else: break
  result = initImage(image.w-lo-ro,image.h-to-bo)
  for x in 0..<result.w:
    for y in 0..<result.h:
      result[x,y] = image[x+lo,y+to]
proc embedOuter*(image:Image,w,h:int):Image =
  doAssert image.w <= w and image.h <= h
  result = initImage(w,h)
  # var c = image[0,0]
  # if c.r == 0 and c.g == 0 and c.b == 0:
  #   c = image[image.w-1,0]
  for x in 0..<w:
    for y in 0..<h:
      result[x,y] = [255.uint8,255.uint8,255.uint8]
  let l = (w - image.w) div 2
  let t = (h - image.h) div 2
  for ix in 0..<image.w:
    for iy in 0..<image.h:
      let x = ix + l
      let y = iy + t
      result[x,y] = image[ix,iy]
# 黒い枠を設置する
proc toMarker*(image:Image,edgeSize:int) : Image =
  let e = edgeSize
  result = initImage(image.w+e*4,image.h+e*4)
  # (自由に設定できる)色に情報をもたせていいなら、それだけで6bitくらい情報を埋め込めてしまう.
  # # マーカーの外枠の色は, 最も暗い色１つと隣接するものに最も近い色にする
  # # その色になるまで,最も暗い色から順にマージしていって枠線を全てマージできる.
  # # マーカーの内枠の色も、最も明るい色１つと...とすれば,
  # # 色の反転にも強くなる.
  # proc getMinDiff(): tuple[light,dark:Color] =
  #   let palette = toSeq(image.getColorPalette().items)
  #   palette = palette.mapIt((it[0],it[1],it[2]).rgb2xyz())
  #   let (minDiff,minSrc,minDst) = diffs[0]
  #   echo diffs[0]
  # discard getMinDiff()
  for x in 0..<result.w:
    for y in 0..<result.h:
      result[x,y] = [0u8,0u8,0u8]
  for x in 0..<result.w - e*2:
    for y in 0..<result.h - e*2:
      result[e+x,e+y] = [255.uint8,255.uint8,255.uint8]
  for x in 0..<image.w:
    for y in 0..<image.h:
      result[e*2+x,e*2+y] = image[x,y]
  echo "MARKER SIZE:",result.w ," x ", result.h

# 認識しやすいように色を正規化・フィルターする
#
proc vividGradation*(image:Image,gamma:float) : Image =
  var rel = initHashSet[(Color,Color)]()
  var toIndex = initTable[Color,int]()
  var colors = newSeq[Color]()
  for x in 0..<image.w:
    for y in 0..<image.h:
      let a = image[x,y]
      if a notin toIndex:
        toIndex[a] = toIndex.len
        colors &= a
      if x > 0:
        let b1 = image[x-1,y]
        if a != b1 and (a,b1) notin rel and (b1,a) notin rel:
          rel.incl((b1,a))
      if y > 0:
        let b2 = image[x,y-1]
        if a != b2 and (a,b2) notin rel and (b2,a) notin rel:
          rel.incl((b2,a))
  var E = newSeqWith(colors.len,newSeq[int]())
  var rev = newSeqWith(colors.len,newSeq[int]())
  for x in rel:
    var (src,dst) = x
    if (src[0],src[1],src[2]).rgb2xyz().xyz2lab().l <
      (dst[0],dst[1],dst[2]).rgb2xyz().xyz2lab().l:
        swap src,dst
    E[toIndex[src]] &= toIndex[dst]
    rev[toIndex[dst]] &= toIndex[src]
  var orders = newSeqWith(colors.len,0)
  for src in rev.topologicalSort():
    for dst in rev[src]:
      orders[dst] = orders[dst].max(orders[src] + 1)
  var lTable = initTable[int,float]()
  block:
    # 100-0 を固定していたが,そうではなく,
    # 端の値だけを固定してやったほうがよいかも
    proc solve(src:int,left:float) =
      if src in lTable and lTable[src] < left: return
      lTable[src] = left
      var left = left - left / orders[src].float
      for dst in E[src]: solve(dst,left)
    var byRev = toSeq(0..<colors.len)
    byRev = byRev.sortedByIt(-orders[it])
    for i in byRev: solve(i,100.0)
  var vividTable = initTable[Color,Color]()
  for i,c in colors:
    let l = lTable[i]
    let (_,a,b) = (c[0],c[1],c[2]).rgb2xyz().xyz2lab()
    let (xr,xg,xb) = (l,a,b).lab2xyz().xyz2rgb()
    vividTable[c] = applyGamma([xr,xg,xb],gamma)
  result = image.deepCopy()
  for x in 0..<result.w:
    for y in 0..<result.h:
      result[x,y] = vividTable[result[x,y]]
  if false:

    let f = open("./a.dot",fmWrite)
    defer: f.close()
    f.writeLine """
      digraph  {
        layout = "dot";
        overlap = false;
        node[
          width = 0.2,
          height = 0.2,
          fontname = "Helvetica",
          style = "filled",
          fillcolor = "#fafafa",
          shape = box,
          style = "filled, bold, rounded"
        ];
        edge[
          len = 0.1,
          fontsize = "8",
          fontname = "Helvetica",
          style = "dashed",
      ];
    """
    proc toName(c:Color):string =
      let (l,a,b) = (c[0],c[1],c[2]).rgb2xyz().xyz2lab()
      if toIndex[c] in lTable:
        # "i" &  $orders[toIndex[c]] & "L" & $(l).int.abs & "L" & $(lTable[toIndex[c]]).int.abs & "A" & $(a * 100).int.abs & "B" & $(b * 100).int.abs
        "i" & $orders[toIndex[c]] & "L" & $(lTable[toIndex[c]]).int.abs & "X" & $toIndex[c]
      else:
        "i" &  $orders[toIndex[c]] & "j" & $orders[toIndex[c]] & "l" & $(l).int.abs & "a" & $(a * 100).int.abs & "b" & $(b * 100).int.abs
    for x in rel:
      var (src,dst) = x
      if (src[0],src[1],src[2]).rgb2xyz().xyz2lab().l <
        (dst[0],dst[1],dst[2]).rgb2xyz().xyz2lab().l:
          swap src,dst
      f.writeLine src.toName()," -> ", dst.toName(),";"
    f.writeLine "\n}"

# 色を変化が大きくなるように変換する
type SrcDstDiff = object
  src,dst: Color
  diff: int
proc `<`(a, b: SrcDstDiff): bool = a.diff < b.diff
proc translateColorPalette*(image:Image,d:int=3,onlyWhiteOut:bool = true) : Image =
  # d^3 色使える
  var leftColors = initHashSet[Color]()
  for r in 0..<d:
    for g in 0..<d:
      for b in 0..<d:
        let l = 255 div (d - 1)
        leftColors.incl [uint8(255.min(l * r)),uint8(255.min(l * g)),uint8(255.min(l * b))]
  var pallete = image.getColorPalette()
  var colorTable = initTable[Color,Color]()
  var pq = initHeapQueue[SrcDstDiff]()
  # 一番外側は白色
  colorTable[image[0,0]] = [255.uint8,255.uint8,255.uint8]
  leftColors.excl [255.uint8,255.uint8,255.uint8]
  if not onlyWhiteOut:
    # 一色を一番近い色に当てはめる
    for pc in pallete:
      for lc in leftColors:
        let diff =
          (pc.r-lc.r)*(pc.r-lc.r)+
          (pc.g-lc.g)*(pc.g-lc.g)+
          (pc.b-lc.b)*(pc.b-lc.b)
        pq.push(SrcDstDiff(src:pc,dst:lc,diff:diff))
    while pq.len > 0:
      let now = pq.pop()
      if now.src in colorTable: continue
      if now.dst notin leftColors: continue
      colorTable[now.src] = now.dst
      leftColors.excl now.dst
  result = image.deepCopy()
  echo pallete.len," COLORS"
  for x in 0..<image.w:
    for y in 0..<image.h:
      if result[x,y] in colorTable:
        result[x,y] = colorTable[result[x,y]]





# 見やすいように10倍サイズに
proc savePNGx10*(image:Image,path:string) =
  var x10 = initImage(image.w*10,image.h*10)
  for x in 0..<image.w:
    for y in 0..<image.h:
      for xi in 0..<10:
        for yi in 0..<10:
          x10[xi+x*10,yi+y*10] = image[x,y]
  x10.savePNG(path)

# UNION-FIND
type UnionFind* = seq[int]
proc initUnionFind*(size:int) : UnionFind =
  when NimMajor * 100 + NimMinor <= 18: result = newSeq[int](size)
  else: result = newSeqUninitialized[int](size)
  for i in 0.int32..<size.int32: result[i] = i
proc root*(self:var UnionFind,x:int): int =
  if self[x] == x: return x
  self[x] = self.root(self[x])
  return self[x]
proc same*(self:var UnionFind,x,y:int) : bool = self.root(x) == self.root(y)
proc merge*(self:var UnionFind,sx,sy:int) : bool {.discardable.} =
  var rx = self.root(sx)
  var ry = self.root(sy)
  if rx == ry : return false
  if self[ry] < self[rx] : swap(rx,ry)
  if self[rx] == self[ry] : self[rx] -= 1
  self[ry] = rx
  return true
proc count*(self:var UnionFind,x:int):int = # 木毎の要素数(最初は全て1)
  let root = self.root(x)
  for p in self:
    if self.root(p) == root: result += 1
proc counts*(self:var UnionFind):seq[int] = # 木毎の要素数(最初は全て1)
  result = newSeqWith(self.len,0)
  for i in 0..<self.len:
    result[self.root(i)] += 1
proc sames*(self:var UnionFind):seq[seq[int]] = # 木毎の要素数(最初は全て1)
  result = newSeqWith(self.len,newSeq[int]())
  for i in 0..<self.len:
    result[self.root(i)] &= i

# MONOID + UNIONFIND
type MonoidUnionFind*[T] = ref object
  uf*: UnionFind
  apply: proc(x,y:T): T
  data: seq[T]
proc newMonoidUnionFind*[T](arr:seq[T],apply:proc(x,y:T): T) : MonoidUnionFind[T] =
  new(result)
  result.uf = initUnionFind(arr.len)
  result.data = arr
  result.apply = apply
proc root*[T](self: var MonoidUnionFind[T],x:int): int = self.uf.root(x)
proc same*[T](self: var MonoidUnionFind[T],x,y:int) : bool = self.uf.same(x,y)
proc merge*[T](self:var MonoidUnionFind[T],sx,sy:int) : bool {.discardable.} =
  if self.same(sx,sy) : return false
  let srx = self.data[self.root(sx)]
  let sry = self.data[self.root(sy)]
  result = self.uf.merge(sx,sy)
  let r = self.root(sx)
  self.data[r] = self.apply(srx,sry)
proc rootElem*[T](self: var MonoidUnionFind[T],x:int): T = self.data[self.uf.root(x)]


# KD-TREE
type
  Pos2D*[T] = tuple[x,y:T]
  KDNode2D[T] = ref object
    pos: Pos2D[T]
    left,right: KDNode2D[T]
    sameCount: int
  KDTree2D*[T] = ref object
    root: KDNode2D[T]
    size: int
proc newKDNode2D[T](pos:Pos2D[T]):KDNode2D[T] =
  new(result)
  result.pos = pos
  result.sameCount = 1
proc add[T](self:KDNode2D[T],isX:bool,pos:Pos2D[T]):KDNode2D[T] =
  if self == nil:
    return newKDNode2D(pos)
  if pos == self.pos:
    self.sameCount += 1
    return self
  if (isX and pos.x < self.pos.x) or
     (not isX and pos.y < self.pos.y):
    self.left = self.left.add(not isX,pos)
  else:
    self.right = self.right.add(not isX,pos)
  return self
proc erase[T](self:KDNode2D[T],isX:bool,pos:Pos2D[T]) : bool {.discardable.}=
  if self == nil: return false
  if self.pos == pos:
    if self.sameCount > 0:
      self.sameCount -= 1
      return true
    return false
  if (isX and pos.x < self.pos.x) or
     (not isX and pos.y < self.pos.y):
    return self.left.erase(not isX,pos)
  else:
    return self.right.erase(not isX,pos)
proc contains[T](self:KDNode2D[T],isX:bool,pos:Pos2D[T]) : bool =
  if self == nil: return false
  if self.pos == pos:
    return self.sameCount > 0
  if (isX and pos.x < self.pos.x) or
     (not isX and pos.y < self.pos.y):
    return self.left.contains(not isX,pos)
  else:
    return self.right.contains(not isX,pos)
proc findNearest[T](self:KDNode2D[T],distanceFunc : proc (a,b:Pos2D[T]): T,isX:bool,pos:Pos2D[T],nowDist:T): tuple[pos:Pos2D[T],dist:T] =
  if self == nil: return (pos,nowDist)
  var resDist = nowDist
  var resPos : Pos2D[T]
  if self.sameCount > 0:
    let dist = distanceFunc(self.pos,pos)
    if dist < resDist:
      resDist = dist
      resPos = self.pos
  let isLeft =
     (isX and pos.x < self.pos.x) or
     (not isX and pos.y < self.pos.y)
  proc update(isLeft:bool) =
    let found =
      if isLeft : self.left.findNearest(distanceFunc,not isX,pos,resDist)
      else: self.right.findNearest(distanceFunc,not isX,pos,resDist)
    if found.dist < resDist:
      resPos = found.pos
      resDist = found.dist
  update(isLeft)
  if (isX and distanceFunc(pos,(self.pos.x,pos.y)) < resDist) or
    (not isX and distanceFunc(pos,(pos.x,self.pos.y)) < resDist):
    update(not isLeft)
  return (resPos,resDist)
proc newKDTree2D*[T]():KDTree2D[T] = new(result)
proc len*[T](self:KDTree2D[T]):int = self.size
proc add*[T](self:KDTree2D[T],pos:Pos2D[T]) =
  self.root = self.root.add(false,pos)
  self.size += 1
proc erase*[T](self:KDTree2D[T],pos:Pos2D[T]): bool {.discardable.} =
  result = self.root.erase(false,pos)
  if result: self.size -= 1
proc contains*[T](self:KDTree2D[T],pos:Pos2D[T]): bool =
  self.root.contains(false,pos)
proc findNearest*[T](self:KDTree2D[T],distanceFunc : proc (a,b:Pos2D[T]):T,pos:Pos2D[T]): tuple[pos:Pos2D[T],dist:T] =
  result = self.root.findNearest(distanceFunc,false,pos,1e12.T)
iterator items*[T](self:KDTree2D[T]) : Pos2D[T] =
  var nodes = @[self.root]
  while nodes.len > 0:
    let now = nodes.pop()
    if now == nil: continue
    for i in 0..<now.sameCount: yield now.pos
    if now.left != nil : nodes.add(now.left)
    if now.right != nil: nodes.add(now.right)
proc sqEuclidDistance*[T](a,b:Pos2D[T]): T = # 円
  (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y)
proc manhattanDistance*[T](a,b:Pos2D[T]): T = # ひし形
  abs(a.x - b.x) + abs(a.y - b.y)
proc chebyshevDistance*[T](a,b:Pos2D[T]): T = # 四角
  abs(a.x - b.x).max(abs(a.y - b.y))
proc buildKDNode[T](poses:seq[Pos2D[T]],isX:bool):KDNode2D[T] =
  if poses.len == 0 : return nil
  let poses =
    if isX: poses.sortedByIt(it.x)
    else: poses.sortedByIt(it.y)
  new(result)
  let mid = poses.len div 2
  var midP = mid
  var midM = mid
  result.pos = poses[mid]
  result.sameCount = 1
  for i in (mid+1)..<poses.len:
    if poses[i] != poses[mid]: break
    result.sameCount += 1
    midP = i
  for i in (mid-1).countDown(0):
    if poses[i] != poses[mid]: break
    result.sameCount += 1
    midM = i
  result.left = poses[0..<midM].buildKDNode(not isX)
  result.right = poses[midP+1..^1].buildKDNode(not isX)
proc buildKDTree2D*[T](poses:seq[Pos2D[T]]):KDTree2D[T] =
  new(result)
  result.size = poses.len
  result.root = poses.buildKDNode(false)
