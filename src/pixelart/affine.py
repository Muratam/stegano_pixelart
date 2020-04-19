import cv2 as cv
import numpy as np
import sys

# マーカーを見つけてアフィン変換してくれる
# python3 affine.py ./hoge/fuga.png  ./hoge/fuga2.png
# => ./hoge/fuga-affine.png ./hoge/fuga2-affine.png


def affine(image_file):
    src = cv.imread(image_file, cv.IMREAD_COLOR)
    height, width, channels = src.shape
    image_size = height * width
    img_gray = cv.cvtColor(src, cv.COLOR_RGB2GRAY)
    _, dst = cv.threshold(
        img_gray, 0, 255, cv.THRESH_BINARY | cv.THRESH_OTSU)
    dst = cv.bitwise_not(dst)
    _, dst = cv.threshold(dst, 0, 255, cv.THRESH_BINARY | cv.THRESH_OTSU)
    contours, _ = cv.findContours(
        dst, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_TC89_L1)
    allows = []
    for contour in contours:
        area = cv.contourArea(contour)
        if area < image_size * 0.1:
            continue
        if image_size * 0.99 < area:
            continue
        epsilon = 0.1 * cv.arcLength(contour, True)
        approx = cv.approxPolyDP(contour, epsilon, True).astype(np.float32)
        if len(approx) != 4:
            continue
        approx = list(approx)
        approx = np.array([
            sorted(approx, key=lambda a:a[0][0] + a[0][1])[0],
            sorted(approx, key=lambda a:-a[0][0] + a[0][1])[0],
            sorted(approx, key=lambda a:a[0][0] - a[0][1])[0],
            sorted(approx, key=lambda a:-a[0][0] - a[0][1])[0],
        ])
        width = 560
        height = 560
        base = np.float32(
            [[[0, 0]], [[width, 0]], [[0, height]], [[width, height]], ])
        pt = cv.getPerspectiveTransform(approx, base)
        dst = cv.warpPerspective(src, pt, (width, height))
        # dst = (dst - np.mean(dst)) / np.std(dst)*64+128
        return dst


def process_dir(argv):
    for arg in argv[1:]:
        dst = affine(arg)
        if type(dst) == type(None):
            print("CANNOT FIND")
        else:
            cv.imwrite(arg.split(".")[0] + "-affine.png", dst)


if __name__ == '__main__':
    process_dir(sys.argv)
