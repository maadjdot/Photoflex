# PhotoFlex UI 视觉修订 V2

日期：2026-09-15

## 用户修订要求

- 与现有网站保持一致：白底黑字、细边框、紧凑控件。
- Sequence 黑色工作层完全覆盖页面，移除底部照片栏。
- Layout 简化为大画布，页面、材料、详细属性按需展开。

## 交付

- [Table V2](01-table-guidance-v2.png)
- [Sequence V2](02-sequence-overlay-v2.png)
- [Layout V2](03-layout-editor-v2.png)
- [更新后的迭代文档](../../docs/用户迭代改动文档.md)

使用内置 image_gen 工具编辑；未使用 CLI。V1 文件保留用于对照，V2 为当前设计。图片是视觉示例，行为规则以迭代文档为准。

## 参照

现有网站截图：`../table-review-2026-09-06/current-1672.png`、`../Sequence/sequence-ui-updated.png`。前者提供界面密度与黑白视觉，后者提供紧凑编辑工具样式。参考截图的旧导航与底部照片栏不属于 V2 功能要求。

## 最终编辑提示词

### Sequence

```text
Use case: ui-mockup / image editing. Edit image 1, the previous PhotoFlex Sequence concept. User correction is absolute: FULL-BLEED SOLID BLACK overlay covers EVERY PIXEL of the application viewport. NO underlying Table visible anywhere, NO surrounding margin, NO sidebar, NO app header, NO rounded dialog frame. REMOVE the entire bottom thumbnail filmstrip, all thumbnail photos and its container, separator and guide. Do not replace it with another strip. Preserve the three large original photographs and their editorial photographic feel; space them horizontally at varying size on a continuous #000000 canvas with generous black space. At top left subtle small white sans-serif text "海岸初选" and grey "Sequence · 12 张照片". At top right a single compact row of plain white text controls "编序" underlined, "阅读", "创建排版 →", followed by a thin white square close X in the extreme top-right. NO pill toggle, NO floating pill toolbar, NO orange, red, beige or other UI accent color. The sole palette for UI is pure black, white and neutral gray; photo colors stay natural. One thin white selection border around the middle portrait photo. Below the selected photo a tiny low-contrast monochrome contextual inline text row "前移  后移  插入  ···", no card. At bottom left only a small grey inline helper "拖动照片调整顺序", bottom right only "05 / 12" and two simple previous/next chevrons. These tiny text controls sit directly on black with NO bar or panel. The bottom 20 percent is otherwise empty uninterrupted solid black. No tutorials popover. Maintain original landscape 16:10 single flat screen aspect ratio. Crisp light typography consistent with a quiet existing photography tool, not a fancy dashboard. This is a redesign of overlay chrome ONLY, not a collage or presentation slide. Mandatory: completely edge-to-edge black, no bottom photos.
```

### Table

```text
Use case: ui-mockup / image editing. Image 1 is the EDIT TARGET, prior PhotoFlex Table concept. Image 2 is STYLE REFERENCE of the existing actual Table website, NOT its navigation/data specification. Restyle image 1 to closely match the existing website: compact typography, white header, black text, straight thin neutral gray borders, near-square controls, neutral very pale gray dotted table. REMOVE ALL terracotta/orange selection, warm beige backgrounds, cream paper notes, colored PDF/Word icons, large rounded panels and soft drop shadows. UI is only WHITE BLACK neutral GRAY, photographs keep original natural colors. Keep project "海岸手记", 5 standalone coastal photographs, a small note, the pile with constant BLACK "打开编序 →" button, and right "材料库" containing folders, PDFs, notes and reference images. Use smaller flatter photo cards and pile, closer to actual website density, wider empty table areas. Header approximately 44px: small "PhotoFlex / 海岸手记", center ONLY "Table" and "Layout", active Table BLACK underline, right "已保存到本机" and "导出项目包". Do NOT add Home/Project/Sequence/PDF nav tabs from style reference. Remove decorative workflow stepper. Place ONE compact white rectangular hint with thin gray border right beside the pile action, simple black text "点击这里，开始编序" and a small ×, no pointer bubble, no colored icon. A small white square note uses normal sans serif text "先从海岸开始，再进入城市。". Right materials column flat white, compact black outlined file icons, narrow rows, subtle gray dividers. Match the reference's quiet compact chrome and strong whitespace. Bottom left count correctly says "5 张照片 · 1 个序列". NO bottom photograph strip. Original landscape 16:10 flat app screenshot, no external labels or frame. Keep images and functional meaning, simplify the surface substantially.
```

### Layout

```text
Use case: ui-mockup / image editing. Image 1 is EDIT TARGET the old PhotoFlex Layout UI. Image 2 is the STYLE REFERENCE actual existing PhotoFlex UI: very simple white surfaces, black small type, thin neutral gray separators, compact text tools. Redesign Layout to be MUCH SIMPLER and strictly white background black text, preserving the central two-photo editorial page and its title/body content. Entire app WHITE, page WHITE, a hairline #d4d2cc page outline distinguishes page from white workspace; NO gray pasteboard, no texture, no gradient, no shadow. NO orange, terracotta, beige, blue or any UI accent; photographs retain original natural color. REMOVE BOTH permanently visible left thumbnails/layers sidebar and right property inspector completely. REMOVE all rulers. REMOVE the floating tool palette. Give most of the entire screen to the large beautiful white landscape page centered with plenty of white margin. Preserve the left large coastal photograph, upper right small lighthouse photograph, lower right elegant black title "Between shore & city" on two lines and Chinese description, small folio 02. Refine layout typography not giant. Selected title has a fine BLACK bounding box with tiny BLACK/WHITE square handles, NO colored guides. Header top 44px: left small "PhotoFlex / 海岸手记"; center ONLY "Table" and "Layout" with BLACK underline on Layout; right "已保存到本机" then small black "导出 PDF" button. Second header a compact single white row 36px, with thin gray bottom border: left "海岸手记 · 作品集"; middle inline controls "+ 图片", "+ 文字", undo redo; right "页面", "材料", "更多". All modest plain text/icon buttons, no big rounded boxes. At selected title show just ONE small flat white inline text toolbar immediately above the selected text box: "衬线体  48  左对齐  ···" with subtle 1px border, no more than 240px wide, no shadow. All detailed properties hidden behind "更多"/ellipsis, materials hidden until clicking "材料", page list hidden until clicking "页面". Bottom a simple white text status row: left "‹  第 2 / 4 页  ›   + 添加页面", right "−  75%  +". No bottom thumbnails. Must visibly look like a minimal photography website editing mode, not a desktop publishing dashboard. Match actual reference's compact understated controls. Landscape 16:10 straight-on single app screen, no outside caption.
```

