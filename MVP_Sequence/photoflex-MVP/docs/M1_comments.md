# M2阶段改动意见02
- 进pool了之后照片不做成灰色，只要颜色变得灰阶一点/饱和度降低就好；
- 增加删除project的功能，按住project方块拖入下方垃圾桶进行删除，在project部分Add photo folder旁边也增加删除project的按键；
- 照片大图预览部分依旧无法展示完整照片，可以参考prototype解决这一问题；
- 大图预览部分滚轮放大与上下冲突了，放大缩小变为Ctrl+滚轮；
- 导航栏放在网页正中间；
- 左侧栏收起时project字样像右侧栏收起时一样变为竖排；



# M1阶段改动意见01
- UI没有按我的来做：严格按照 https://www.figma.com/design/VhqX4TvzZ1Dl6vDS9owRTD/Photoflex_frontend?m=auto&t=20gV9ELzUdYZLTij-6 的设计稿来做，不要用自己的东西做；除了交互说明里的，不要增加设计稿中没有的文字；不要增加设计稿中没有的模块
- 字体使用Ancizar Serif，背景颜色为#FFFFFF，主要颜色为#FFFCF9,黑色按钮#1C1814，框线颜色#D9D0C6；
- 离开/刷新网页无法重新读取照片（显示missing），refresh不成功
- 对于不同的显示比例，要如何适配使UI不会变形？；
- Project封面使用project里的第一张照片；
- contact Sheet滚动停下时时会强制回到照片最上方显示完整，移除这个设计，滚动停止就停在原地；
- 右侧pool栏并没有整栏收起来，只把照片收起来了;
- 变换project会丢失照片，使得要重新扫描；
- 大图预览部分面对不同尺寸的图片会裁剪，修复使得对于不同尺寸的照片都能够显示完整照片；
- 预览的图片在整个页面中心，覆盖左右侧栏
- Pool缺少大图预览功能