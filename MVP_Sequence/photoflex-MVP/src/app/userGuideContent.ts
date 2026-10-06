import type { Locale } from "./locale";

interface GuideStep {
  readonly title: string;
  readonly body: string;
  readonly details?: readonly { readonly title: string; readonly body: string }[];
}

export interface GuideContent {
  readonly title: string;
  readonly contents: string;
  readonly previous: string;
  readonly next: string;
  readonly done: string;
  readonly close: string;
  readonly progress: (current: number, total: number) => string;
  readonly chapters: readonly {
    readonly id: string;
    readonly title: string;
    readonly intro?: string;
    readonly steps: readonly GuideStep[];
    readonly shortcuts?: readonly { readonly keys: string; readonly action: string }[];
  }[];
}

const zhControls = {
  contents: "指南目录", previous: "上一章", next: "下一章", done: "完成",
  progress: (current: number, total: number) => `第 ${current} / ${total} 章`,
};
const enControls = {
  contents: "Guide contents", previous: "Previous", next: "Next chapter", done: "Done",
  progress: (current: number, total: number) => `Chapter ${current} of ${total}`,
};

export const userGuideContent: Record<Locale, GuideContent> = {
  "zh-CN": {
    ...zhControls, title: "使用指南", close: "关闭使用指南",
    chapters: [
      {
        id: "start", title: "总览",
        intro: "Photoflex 是一款帮助摄影师进行项目编辑工作的工具，有以下三大功能模块：",
        steps: [
          { title: "自由选片", body: "把照片放到白板工具上，可以自由移动、排列和比较，挑选想使用的照片，尝试不同的位置、序列与组合。" },
          { title: "编排序列", body: "将照片组成序列，调整先后顺序，查看连续阅读的效果。" },
          { title: "排版导出", body: "把序列制作成摄影集页面的草稿，调整版式并导出 PDF。" },
        ],
      },
      {
        id: "sources", title: "一：导入与浏览照片",
        steps: [
          { title: "添加来源", body: "选择照片资料夹，将其中的照片加入素材库。可以添加多个资料夹。" },
          { title: "添加到白板", body: "选中素材库中的照片，点击「添加到桌面」，或直接拖入白板。" },
          { title: "查看照片", body: "双击缩略图查看大图；或打开「照片库」可以集中浏览和挑选照片。" },
        ],
      },
      {
        id: "canvas", title: "二：选择、移动与排列",
        steps: [
          { title: "选择与移动照片", body: "点击选择一张照片，按住 Shift 可多选，也可以在空白处拖动框选。拖动所选照片可以一起移动。" },
          { title: "排列照片", body: "选中至少两张未锁定的照片后，左侧会出现以下工具：", details: [
            { title: "网格", body: "将照片排成多行，可以设置每行的照片数量。" },
            { title: "横排", body: "将照片排成一行。" },
            { title: "打乱", body: "随机交换照片的位置。" },
            { title: "对齐", body: "将照片的左边、右边、顶部、底部或中心对齐。" },
            { title: "分组", body: "将照片组成一组，方便一起选择和移动。" },
          ] },
          { title: "白板操作", body: "鼠标滚轮可以缩放白板大小，按住鼠标中键／右键可以移动画布区域。" },
        ],
      },
      {
        id: "tools", title: "三：分组、画框与便笺",
        steps: [
          { title: "整理照片关系", body: "分组方便一起移动照片；连线可以标记照片之间的关系；锁定可以固定照片，防止误改。" },
          { title: "自由连线", body: "点击左侧「连线」或按 L，按住鼠标拖动后放开即可画线。两端靠近照片、便笺或 Frame 时自动连接，并随物件移动。按 Esc 退出绘制，点击线段后按 Delete 可删除。" },
          { title: "画框", body: "可将照片放入预设照片框样式，并自由调整照片在框中的位置／大小等。" },
          { title: "添加便笺", body: "在桌面记录文字想法。" },
        ],
      },
      {
        id: "sequence", title: "四：创建与阅读序列",
        steps: [
          { title: "创建序列", body: "选择多张照片，点击「创建序列」可创建一个带有顺序的照片堆，方便对比调整不同的照片序列。" },
          { title: "调整顺序", body: "点击序列卡片进入编辑，拖动照片可改变先后顺序，也可以移除不需要的照片。" },
          { title: "阅读序列", body: "点击「阅读」，按横向顺序阅读照片，可检查整组照片的呈现效果。" },
          { title: "输出照片文件夹", body: "点击「创建 Sequence 文件夹」，可将这组照片复制到目标资料夹。" },
        ],
      },
      {
        id: "layout", title: "五：排版与导出",
        steps: [{ title: "创建页面", body: "从序列生成摄影集页面，或从空白页开始排版。" }],
      },
      {
        id: "shortcuts", title: "快捷键", steps: [],
        shortcuts: [
          { keys: "Ctrl / ⌘ + A", action: "选择所有桌面照片" },
          { keys: "Shift + 点击", action: "增加或取消选择" },
          { keys: "Ctrl / ⌘ + Z", action: "撤销" },
          { keys: "Ctrl / ⌘ + Shift + Z", action: "重做" },
          { keys: "Space / P", action: "预览所选照片" },
          { keys: "+ / −", action: "放大／缩小画布" },
          { keys: "0", action: "让照片适应画布" },
          { keys: "Y / R / H", action: "网格排列／横排／打乱" },
          { keys: "G / K", action: "分组／锁定或解锁" },
          { keys: "L", action: "启用或退出连线工具" },
          { keys: "C", action: "对比两张照片或两个序列" },
          { keys: "M", action: "添加便笺" },
          { keys: "S / N", action: "创建序列／加入已有序列" },
          { keys: "Delete", action: "从桌面移除所选照片" },
          { keys: "Esc", action: "取消当前操作或选择" },
        ],
      },
    ],
  },
  en: {
    ...enControls, title: "User guide", close: "Close user guide",
    chapters: [
      {
        id: "start", title: "Overview",
        intro: "Photoflex helps photographers edit their projects through three main workspaces:",
        steps: [
          { title: "Explore photographs", body: "Place photos on the whiteboard to move, arrange and compare them. Select the photos you want to use and try different positions, sequences and combinations." },
          { title: "Build a Sequence", body: "Put photographs into a Sequence, adjust their order and review the reading experience." },
          { title: "Design & export", body: "Turn a Sequence into a draft photo book, adjust the page design and export a PDF." },
        ],
      },
      {
        id: "sources", title: "1: Import & browse",
        steps: [
          { title: "Add a source", body: "Select a photo folder to add its photographs to your library. You can add several folders." },
          { title: "Add to the whiteboard", body: "Select photos in the library and choose Add to Table, or drag them onto the whiteboard." },
          { title: "View photos", body: "Double-click a thumbnail to preview it, or open Contact Sheet to browse and select photographs together." },
        ],
      },
      {
        id: "canvas", title: "2: Select, move & arrange",
        steps: [
          { title: "Select and move photos", body: "Click to select a photo, hold Shift to select several, or drag across an empty area to select a group. Drag the selected photos to move them together." },
          { title: "Arrange photos", body: "Select at least two unlocked photos to reveal these tools on the left:", details: [
            { title: "Grid", body: "Arrange photos in several rows and choose how many photos each row contains." },
            { title: "Row", body: "Arrange photos in a single row." },
            { title: "Shuffle", body: "Randomly swap the photos' positions." },
            { title: "Align", body: "Align the photos' left, right, top, bottom or centre." },
            { title: "Group", body: "Keep photos in a group to select and move them together." },
          ] },
          { title: "Navigate the whiteboard", body: "Scroll the mouse wheel to zoom. Hold the middle or right mouse button to move around the canvas." },
        ],
      },
      {
        id: "tools", title: "3: Groups, Frames & Memos",
        steps: [
          { title: "Organize photo relationships", body: "Group photos to move them together, link them to mark relationships, or lock them to prevent accidental changes." },
          { title: "Draw connections", body: "Click Link on the left or press L, then drag and release to draw a line. Endpoints snap to photos, Memos and Frames and follow them as they move. Press Esc to exit drawing; click a line and press Delete to remove it." },
          { title: "Frames", body: "Place photos into preset frame styles and freely adjust their position and size inside the frames." },
          { title: "Add a Memo", body: "Record your ideas in a note on the Table." },
        ],
      },
      {
        id: "sequence", title: "4: Build & read a Sequence",
        steps: [
          { title: "Create a Sequence", body: "Select several photos and choose Create Sequence to make an ordered pile. Compare and refine different photo sequences." },
          { title: "Adjust the order", body: "Click the Sequence pile to edit it. Drag photos to change their order or remove photographs you no longer need." },
          { title: "Read the Sequence", body: "Choose Read to view the photos in a horizontal sequence and check how the whole selection works together." },
          { title: "Export a photo folder", body: "Choose Create Sequence Folder to copy this selection to a destination folder." },
        ],
      },
      {
        id: "layout", title: "5: Design & export",
        steps: [{ title: "Create pages", body: "Generate photo book pages from a Sequence or start with a blank page." }],
      },
      {
        id: "shortcuts", title: "Keyboard shortcuts", steps: [],
        shortcuts: [
          { keys: "Ctrl / ⌘ + A", action: "Select all Table photos" },
          { keys: "Shift + click", action: "Add or remove selected photos" },
          { keys: "Ctrl / ⌘ + Z", action: "Undo" },
          { keys: "Ctrl / ⌘ + Shift + Z", action: "Redo" },
          { keys: "Space / P", action: "Preview selected photo" },
          { keys: "+ / −", action: "Zoom in / out" },
          { keys: "0", action: "Fit photos to the canvas" },
          { keys: "Y / R / H", action: "Grid / row / shuffle" },
          { keys: "G / K", action: "Group / lock or unlock" },
          { keys: "L", action: "Activate or exit the line tool" },
          { keys: "C", action: "Compare two photos or Sequences" },
          { keys: "M", action: "Add a Memo" },
          { keys: "S / N", action: "Create / add to a Sequence" },
          { keys: "Delete", action: "Remove selected photos from Table" },
          { keys: "Esc", action: "Cancel the current action or selection" },
        ],
      },
    ],
  },
};

export const layoutGuideContent: Record<Locale, GuideContent> = {
  "zh-CN": {
    ...zhControls, title: "排版使用说明", close: "关闭排版使用说明",
    chapters: [
      {
        id: "pages", title: "页面与视图",
        steps: [
            { title: "管理页面", body: "新建 Layout 自动包含封面和封底；已有 Layout 可在左侧添加。在左侧选择页面，可以添加空白页、复制页或删除页。拖动正文页面缩略图可以改变顺序。" },
          { title: "页面尺寸", body: "点击工具栏中的页面尺寸，选择预设尺寸或输入自定义尺寸。" },
          { title: "查看页面", body: "单页显示一张页面，对页显示相邻页面。缩放和「适应页面」方便查看版式；「拖动画布」可以移动查看区域。" },
        ],
      },
      {
        id: "photos", title: "照片排版",
        steps: [
          { title: "添加照片与图像框", body: "点击底部素材照片或拖入页面，可以添加照片。选择「图像」工具并在页面上拖动，可以先画出图像框，再放入照片。" },
          { title: "移动与调整大小", body: "拖动图像框改变位置，拖动边缘手柄调整大小。选中图像框后，也可以在右侧输入位置和尺寸。" },
          { title: "照片适配", body: "Fit：完整显示照片。Fill：让照片填满图像框。双击照片进入裁切后，可拖动照片调整位置，滚轮调整大小，点击「完成」保存裁切。" },
          { title: "使用模板", body: "在底部素材栏勾选照片，再点击右侧模板，可以将照片放入预设版式。" },
            { title: "照片效果", body: "在右侧设置当前页照片的内边框模式、宽度、颜色与浮起高度，也可以将照片效果应用到全部页面。" },
        ],
      },
      {
        id: "text", title: "文字与纸张",
        steps: [
          { title: "添加文字", body: "选择「文字」工具，在页面上拖出文字框并输入文字。双击已有文字框可以继续编辑。" },
          { title: "文字样式", body: "选中文字框，在右侧调整字体、字号、颜色、行距和对齐方式。" },
          { title: "纸张样式", body: "在右侧选择纸张颜色与材质。点击「应用到全部页面」，可以统一整本草稿的纸张样式。" },
        ],
      },
      {
        id: "export", title: "阅读与导出",
        steps: [
          { title: "撤销与重做", body: "工具栏的撤销和重做按钮，可以退回或恢复刚才的排版操作。" },
            { title: "阅读", body: "点击右上角「阅读」，查看摄影集页面的整体呈现效果。封面和封底始终独立显示，正文可切换单页和对页。" },
          { title: "导出 PDF", body: "点击「导出 PDF」，选择质量并导出。若提示有空图像框或照片不可用，先处理提示中的页面再重试。" },
        ],
      },
    ],
  },
  en: {
    ...enControls, title: "Layout guide", close: "Close Layout guide",
    chapters: [
      {
        id: "pages", title: "Pages & views",
        steps: [
            { title: "Manage pages", body: "New Layouts include front and back covers. Existing Layouts can add them on the left. Select pages to add blank pages, duplicate or delete pages, and drag body thumbnails to change their order." },
          { title: "Page size", body: "Use the page size control in the toolbar to choose a preset or enter custom dimensions." },
          { title: "View pages", body: "Single shows one page; Facing pages shows adjacent pages. Zoom and Fit page help you review the design. Pan moves the viewing area." },
        ],
      },
      {
        id: "photos", title: "Photo layout",
        steps: [
          { title: "Add photos and image frames", body: "Click a photo in the bottom asset tray or drag it onto a page. Select Image and drag on a page to draw an empty image frame, then place a photo into it." },
          { title: "Move and resize", body: "Drag a frame to move it and drag its edge handles to resize. Select it to enter its position and dimensions on the right." },
          { title: "Fit and crop", body: "Fit: show the whole photo. Fill: cover the frame. Double-click to crop, drag the photo to reposition it and scroll to resize. Choose Done to save the crop." },
          { title: "Use templates", body: "Select photos using the checkboxes in the bottom asset tray, then choose a template on the right to place them in a preset design." },
            { title: "Photo effects", body: "Set the current page's photo edge mode, width, colour and elevation on the right. You can also apply these effects to every page." },
        ],
      },
      {
        id: "text", title: "Text & paper",
        steps: [
          { title: "Add text", body: "Select Text, drag on the page to draw a text box and type. Double-click an existing text box to edit it." },
          { title: "Text styles", body: "Select a text box to change its font, size, colour, line height and alignment on the right." },
          { title: "Paper styles", body: "Choose a paper colour and material on the right. Apply to all pages gives the whole draft the same paper style." },
        ],
      },
      {
        id: "export", title: "Read & export",
        steps: [
          { title: "Undo and redo", body: "Use Undo and Redo in the toolbar to reverse or restore your latest layout changes." },
          { title: "Read", body: "Choose Read at the top right to review how the photo book pages work together." },
          { title: "Export PDF", body: "Choose Export PDF, select a quality setting and export. If empty frames or unavailable photos are reported, resolve them on the listed pages and retry." },
        ],
      },
    ],
  },
};
