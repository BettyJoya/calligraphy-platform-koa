# encoding: utf-8

from PIL import Image
import cv2
import numpy as np
import sys
import os
from skimage import morphology
import math

# def thining_img(image_path, save_path):
#     img = cv2.imread(image_path, 0)   # 读取图片
#     _,binary = cv2.threshold(img, 200, 255, cv2.THRESH_BINARY_INV)  # 二值化处理

#     binary[binary==255] = 1
#     skeleton0 = morphology.skeletonize(binary)   # 骨架提取
#     skeleton = skeleton0.astype(np.uint8)*255
#     cv2.imwrite(save_path, skeleton)        # 保存骨架提取后的图片

# class Calc:
#     @staticmethod
#     def get_min_sum(x, y, yuan):
#         temp = 10000
#         for i in range(len(yuan)):
#             for j in range(len(yuan[0])):
#                 if yuan[i][j] == 255:
#                     dis = Calc.get_min(x, y, i, j)
#                     if temp > dis:
#                         temp = dis
#         return temp

#     @staticmethod
#     def get_min(x1, y1, x2, y2):
#         dis = math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
#         return dis

# # 合成两个骨架图片
# def compose_img(image_path1, image_path2, save_path):
#     img1 = cv2.imread(image_path1, 0)
#     img2 = cv2.imread(image_path2, 0)
#     img = img1 + img2
#     cv2.imwrite(save_path, img)

# 计算相似度
# def compare_img(linmo, yuan):
#     sum_ = 0
#     dian = 0
#     for i in range(len(linmo)):
#         for j in range(len(linmo[0])):
#             if linmo[i][j] == 255:
#                 sum_ += Calc.get_min_sum(i, j, yuan)
#                 dian += 1
#     r = sum_ / dian
#     if r == 0:
#         return 100.0
#     else:
#         xiangsidu = 100.0 / r
#         return xiangsidu
    

def keep_black(image_path, save_path):
    # 打开图片
    image = Image.open(image_path)

    # 将图片转换为 numpy 数组
    np_image = np.array(image)

    # 将非黑色部分设为白色
    np_image[(np_image[:,:,0] >= 120) | (np_image[:,:,1] >= 120) | (np_image[:,:,2] >= 120)] = 255

    # 创建新的 PIL 图像对象
    new_image = Image.fromarray(np_image)

    # 保存新图片
    new_image.save(save_path)


def trim_white(image_path, save_path):
    # 读取图片
    img = cv2.imdecode(np.fromfile(image_path, dtype=np.uint8), -1)

    # 转换为灰度图像
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # 二值化处理，将白色设为255，黑色设为0
    _, thresh = cv2.threshold(gray, 240, 255, cv2.THRESH_BINARY)

    # 反转图像，黑色变为255，白色变为0
    thresh_inv = cv2.bitwise_not(thresh)

    # 找到黑色部分的轮廓
    contours, _ = cv2.findContours(thresh_inv, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    # 获取最大的轮廓
    max_contour = max(contours, key=cv2.contourArea)

    # 获取最小矩形
    x, y, w, h = cv2.boundingRect(max_contour)

    # 裁剪图像
    trimmed_img = img[y:y+h, x:x+w]
    
    # 将图像设置为128*128大小
    trimmed_img = cv2.resize(trimmed_img, (128, 128))

    # 保存裁剪后的图片
    cv2.imwrite(save_path, trimmed_img)

# 接收两个图片路径参数
if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python compare.py <image1_path> <image2_path>")
        sys.exit(1)

    image_path1 = sys.argv[1]
    image_path2 = sys.argv[2]
    
    black_only_path1 = '.' + image_path2.split(".")[1] + "_black_only1.png"
    black_only_path2 = '.' + image_path2.split(".")[1] + "_black_only2.png"
    trimmed_image_path1 = '.' + image_path2.split(".")[1] + "_trimmed1.png"
    trimmed_image_path2 = '.' + image_path2.split(".")[1] + "_trimmed2.png"
    compose_img_path = '.' + image_path2.split(".")[1] + "_compose.png"

    # 处理第一张图片
    keep_black(image_path1, black_only_path1)
    trim_white(black_only_path1, trimmed_image_path1)

    # 处理第二张图片
    keep_black(image_path2, black_only_path2)
    trim_white(black_only_path2, trimmed_image_path2)

    # 删除两张黑白图片
    os.remove(black_only_path1)
    os.remove(black_only_path2)

    print(trimmed_image_path1, trimmed_image_path2)

    # 返回成功
    sys.exit(0)
