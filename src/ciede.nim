import math
const MPI = 3.141592653589793238462643383279502884197169399375105
proc toleranceZero(x:float) : bool =  x.abs() < 1e-9
proc cosd(degree:float): float = cos(degree * MPI / 180.0)
proc sind(degree:float): float = sin(degree * MPI / 180.0)
proc fqatan(y, x:float):float =
  result = arctan2(y, x) / MPI * 180.0
  if result < 0.0: result += 360.0
proc f7(x:float):float =
  if x < 1.0: return pow(x / 25.0, 3.5)
  return 1.0 / sqrt(1.0 + pow(25.0 / x, 7.0))
proc ciede2000*(L1, a1, b1, L2, a2, b2: float): float =
  let epsilon = 1e-9
  let c1ab = sqrt(a1 * a1 + b1 * b1)
  let c2ab = sqrt(a2 * a2 + b2 * b2)
  let cab = (c1ab + c2ab) / 2.0
  let G = 0.5 * (1.0 - f7(cab))
  let a1 = (1.0 + G) * a1
  let a2 = (1.0 + G) * a2
  let C1 = sqrt(a1 * a1 + b1 * b1)
  let C2 = sqrt(a2 * a2 + b2 * b2)
  let h1 =
    if tolerancezero(a1) and tolerancezero(b1): 0.0
    else: fqatan(b1, a1)
  let h2 =
    if tolerancezero(a2) and tolerancezero(b2): 0.0
    else: fqatan(b2, a2)
  let dL = L2 - L1
  let dC = C2 - C1
  let C12 = C1 * C2
  var dh = 0.0
  var h = h1 + h2
  if not tolerancezero(C12):
    let tmp = h2 - h1
    if abs(tmp) <= 180.0 + epsilon: dh = tmp
    elif tmp > 180.0: dh = tmp - 360.0
    elif tmp < -180.0: dh = tmp + 360.0
  if not tolerancezero(C12):
    let tmp1 = abs(h1 - h2)
    let tmp2 = h1 + h2
    if tmp1 <= 180.0 + epsilon: h = tmp2 / 2.0
    elif tmp2 < 360.0: h = (tmp2 + 360.0) / 2.0
    elif tmp2 >= 360.0: h = (tmp2 - 360.0) / 2.0
  let L = (L1 + L2) / 2.0
  let C = (C1 + C2) / 2.0
  let T = 1.0 - 0.17 * cosd(h - 30.0) + 0.24 * cosd(2.0 * h) +
      0.32 * cosd(3.0 * h + 6.0) - 0.2 * cosd(4.0 * h - 63.0)
  let dTh = 30.0 * exp(-pow((h - 275.0) / 25.0, 2.0))
  let L2 = (L - 50.0) * (L - 50.0)
  let RC = 2.0 * f7(C)
  let SL = 1.0 + 0.015 * L2 / sqrt(20.0 + L2)
  let SC = 1.0 + 0.045 * C
  let SH = 1.0 + 0.015 * C * T
  let RT = -sind(2.0 * dTh) * RC
  const kL = 1.0
  const kC = 1.0
  const kH = 1.0
  let LP = dL / (kL * SL)
  let CP = dC / (kC * SC)
  let HP = (2.0 * sqrt(C12) * sind(dh / 2.0)) / (kH * SH)
  return sqrt(LP * LP + CP * CP + HP * HP + RT * CP * HP)
