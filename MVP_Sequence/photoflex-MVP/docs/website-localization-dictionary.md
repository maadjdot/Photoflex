# PhotoFlex Website Localization Dictionary

## Intent

Add a language switcher for English (`en`) and Simplified Chinese (`zh-CN`) on the Home page. English remains the fallback locale. Product data, IDs, filenames, and backup formats stay language-neutral; only visible interface copy is translated.

## Locale behavior

```text
locale.default       = browser language when supported, otherwise en
locale.supported     = [en, zh-CN]
locale.storageKey    = photoflex:locale
locale.fallback      = en
locale.switcherLabel = en: "Language" | zh-CN: "语言"
```

The selected locale is saved locally and restored on the next visit. Missing keys fall back to English so an incomplete translation never leaves an empty label.

## Dictionary shape

```ts
type Locale = "en" | "zh-CN";
type TranslationDictionary = Record<string, string>;

const translations: Record<Locale, TranslationDictionary> = {
  en: { /* English source strings */ },
  "zh-CN": { /* Simplified Chinese strings */ },
};
```

Keys describe meaning and context rather than the current English wording. Interpolated values use `{name}`, `{count}`, or `{filename}`.

## Core dictionary

```text
app.name                         = en: "PhotoFlex"                         | zh-CN: "PhotoFlex"
nav.home                         = en: "Home"                              | zh-CN: "首页"
nav.project                      = en: "Project"                           | zh-CN: "项目"
nav.contactSheet                 = en: "Contact Sheet"                     | zh-CN: "照片库"
nav.table                        = en: "Table"                             | zh-CN: "桌面"
nav.sequence                     = en: "Sequence"                          | zh-CN: "序列"
nav.login                        = en: "Login"                             | zh-CN: "登录"
nav.backToTable                  = en: "Back to Table"                     | zh-CN: "返回桌面"

home.projects                    = en: "Projects"                          | zh-CN: "项目"
home.newProject                  = en: "New project"                       | zh-CN: "新建项目"
home.beginJourney                = en: "Begin your photo journey"           | zh-CN: "开始你的摄影旅程"
home.createProject               = en: "Create a project"                   | zh-CN: "创建项目"
home.noPhotos                    = en: "No photos on this Table yet"        | zh-CN: "桌面上还没有照片"
home.openTable                   = en: "Open Table"                         | zh-CN: "进入桌面"

project.photoSources             = en: "Photo Sources"                      | zh-CN: "照片来源"
project.addSource                = en: "Add Source"                         | zh-CN: "添加来源"
project.reconnectFolder          = en: "Reconnect folder"                   | zh-CN: "重新连接文件夹"
project.removeSource             = en: "Remove source"                      | zh-CN: "移除照片来源"
project.exportBackup             = en: "Export project backup"              | zh-CN: "导出项目备份"
project.restoreBackup            = en: "Restore project backup"             | zh-CN: "恢复项目备份"
project.originalFilesNote        = en: "Original files are never moved or modified." | zh-CN: "原始文件不会被移动或修改。"

table.empty                      = en: "Bring photographs here to think with them." | zh-CN: "把照片放在这里，与它们一起思考。"
table.placeOnTable               = en: "Place on Table"                     | zh-CN: "放上桌面"
table.addToSequence              = en: "Add to Sequence"                    | zh-CN: "加入序列"
table.createSequence             = en: "Create Sequence"                    | zh-CN: "创建序列"
table.duplicateSequence          = en: "Duplicate New Sequence"             | zh-CN: "建立序列副本"
table.group                      = en: "Group"                              | zh-CN: "分组"
table.ungroup                    = en: "Ungroup"                            | zh-CN: "取消分组"
table.compare                    = en: "Compare"                            | zh-CN: "对比"
table.shuffle                    = en: "Shuffle"                            | zh-CN: "打乱"
table.remove                     = en: "Remove from Table"                 | zh-CN: "从桌面移除"

sequence.order                   = en: "Sequence Order"                    | zh-CN: "序列顺序"
sequence.read                    = en: "Read"                               | zh-CN: "阅读"
sequence.overview                = en: "Overview"                           | zh-CN: "照片概览"
sequence.rename                  = en: "Rename"                             | zh-CN: "重命名"
sequence.ungroup                 = en: "Ungroup"                            | zh-CN: "取消分组"
sequence.duplicate               = en: "Duplicate New Sequence"             | zh-CN: "建立序列副本"
sequence.duplicateHint           = en: "The current order will be copied into a new Sequence pile on Table." | zh-CN: "当前顺序会复制到工作台上的新序列卡片中。"

backup.downloadRecovery          = en: "Download recovery backup"            | zh-CN: "下载恢复备份"
backup.saveRecoveryCopy          = en: "Save recovery copy"                  | zh-CN: "保存恢复副本"
backup.keepEditing               = en: "Keep editing"                       | zh-CN: "继续编辑"
backup.unsavedTitle              = en: "Your latest edits have not been saved." | zh-CN: "最近的编辑尚未保存。"
backup.restoreSuccess            = en: "Backup restored as a new project."   | zh-CN: "备份已恢复为新项目。"

error.generic                    = en: "Something went wrong. Please try again." | zh-CN: "发生错误，请重试。"
error.saveFailed                 = en: "Changes could not be saved."         | zh-CN: "更改无法保存。"
error.folderMismatch             = en: "That folder does not match this project." | zh-CN: "该文件夹与此项目不匹配。"
error.photoMissing               = en: "Photo is unavailable."               | zh-CN: "照片不可用。"
```

## Additional UI vocabulary

The following entries complete the command, navigation, dialog, status, and accessibility vocabulary found across the current website.

```text
common.retry                    = en: "Retry"                             | zh-CN: "重试"
common.cancel                   = en: "Cancel"                            | zh-CN: "取消"
common.close                    = en: "Close"                             | zh-CN: "关闭"
common.save                     = en: "Save"                              | zh-CN: "保存"
common.delete                   = en: "Delete"                            | zh-CN: "删除"
common.open                     = en: "Open"                              | zh-CN: "打开"
common.loading                  = en: "Loading…"                          | zh-CN: "加载中…"
common.updated                  = en: "Updated"                           | zh-CN: "更新于"
common.photos                   = en: "photos"                            | zh-CN: "张照片"
common.items                    = en: "items"                             | zh-CN: "项"

table.undo                      = en: "Undo"                              | zh-CN: "撤销"
table.redo                      = en: "Redo"                              | zh-CN: "重做"
table.memo                      = en: "Memo"                              | zh-CN: "便笺"
table.addMemo                   = en: "Add memo"                           | zh-CN: "添加便笺"
table.memoPlaceholder           = en: "Write a memo…"                     | zh-CN: "写下你的想法…"
table.link                      = en: "Link"                              | zh-CN: "连线"
table.unlink                    = en: "Unlink"                            | zh-CN: "取消连线"
table.preview                   = en: "Preview"                           | zh-CN: "预览"
table.grid                      = en: "Grid"                              | zh-CN: "网格排列"
table.row                       = en: "Row"                               | zh-CN: "横向排列"
table.align                     = en: "Align"                             | zh-CN: "对齐"
table.alignLeft                 = en: "Left"                              | zh-CN: "左对齐"
table.alignCenter               = en: "Center"                            | zh-CN: "水平居中"
table.alignRight                = en: "Right"                             | zh-CN: "右对齐"
table.alignTop                  = en: "Top"                               | zh-CN: "顶部对齐"
table.alignMiddle               = en: "Middle"                            | zh-CN: "垂直居中"
table.alignBottom               = en: "Bottom"                            | zh-CN: "底部对齐"
table.front                     = en: "Front"                             | zh-CN: "置于顶层"
table.clear                     = en: "Clear"                             | zh-CN: "清除"
table.selectAll                 = en: "Select all"                        | zh-CN: "全选"
table.invert                    = en: "Invert"                            | zh-CN: "反选"
table.addSelected               = en: "Add {count} to Table"               | zh-CN: "将 {count} 张照片添加到桌面"
table.removeSelected            = en: "Remove from Table"                 | zh-CN: "从桌面移除"
table.hideSources               = en: "Hide Photo Sources"                | zh-CN: "隐藏照片来源"
table.openSources               = en: "Open Photo Sources"                | zh-CN: "打开照片来源"
table.resizeToolbar             = en: "Move toolbar vertically"           | zh-CN: "垂直移动工具栏"
table.resizeSources             = en: "Resize Photo Sources"              | zh-CN: "调整照片来源面板大小"

source.all                      = en: "All Sources"                       | zh-CN: "所有来源"
source.contactSheet             = en: "Contact Sheet"                     | zh-CN: "照片库"
source.select                   = en: "Select photo source"              | zh-CN: "选择照片来源"
source.manage                  = en: "Manage photo sources"              | zh-CN: "管理照片来源"
source.choose                   = en: "Choose a source"                  | zh-CN: "选择来源"
source.expand                   = en: "Expand Photo Sources"             | zh-CN: "展开照片来源"
source.collapse                 = en: "Collapse Photo Sources"           | zh-CN: "收起照片来源"
source.reconnect                = en: "Reconnect"                         | zh-CN: "重新连接"
source.connectedFolders         = en: "connected folders"                 | zh-CN: "个已连接文件夹"
source.noMatch                  = en: "No photos match this view."        | zh-CN: "没有符合当前视图的照片。"
source.noSupportedJpeg          = en: "No supported JPEG files"           | zh-CN: "没有支持的 JPEG 文件"
source.selectAll                = en: "Select all"                        | zh-CN: "全选"
source.addToTable               = en: "Add to Table"                       | zh-CN: "添加到桌面"
source.onTable                  = en: "On Table"                           | zh-CN: "已在工作台"

sequence.createPile             = en: "Create Pile"                        | zh-CN: "创建照片堆"
sequence.pile                   = en: "Sequence pile"                     | zh-CN: "序列卡片"
sequence.open                   = en: "Open Sequence"                     | zh-CN: "进入序列"
sequence.insertBlankBefore     = en: "Insert Blank Before"               | zh-CN: "在前方插入空白页"
sequence.insertBlankAfter      = en: "Insert Blank After"                | zh-CN: "在后方插入空白页"
sequence.createSpread           = en: "Create Spread"                     | zh-CN: "创建跨页"
sequence.splitSpread            = en: "Split to Singles"                  | zh-CN: "拆分为单页"
sequence.removeBlank            = en: "Remove Blank"                      | zh-CN: "移除空白页"
sequence.dragToReorder           = en: "Drag to reorder"                   | zh-CN: "拖动以重新排序"
sequence.selectPile              = en: "Select one Sequence Pile"         | zh-CN: "选择一个序列卡片"

dialog.sequenceName              = en: "Sequence name"                    | zh-CN: "序列名称"
dialog.sequenceDestination       = en: "Destination Sequence"             | zh-CN: "目标序列"
dialog.selectSequence            = en: "Select Sequence"                  | zh-CN: "选择序列"
dialog.sequenceSources           = en: "Select two Sequences on this Table" | zh-CN: "在桌面选择两个序列"
dialog.comparePhotos             = en: "Compare two photos"                | zh-CN: "比较两张照片"
dialog.swap                      = en: "Swap"                             | zh-CN: "交换"
dialog.whiteBackground           = en: "White background"                  | zh-CN: "白色背景"
dialog.darkBackground            = en: "Dark background"                   | zh-CN: "深色背景"
dialog.previousUnit              = en: "Previous Reading Unit"             | zh-CN: "上一个阅读单元"
dialog.nextUnit                  = en: "Next Reading Unit"                 | zh-CN: "下一个阅读单元"

status.changesNotSaved           = en: "Changes not saved · Retry"          | zh-CN: "更改未保存 · 重试"
status.previewUnavailable        = en: "Preview unavailable"               | zh-CN: "预览不可用"
status.missing                   = en: "MISSING"                           | zh-CN: "缺失"
status.reconnecting              = en: "Connecting photo folder…"          | zh-CN: "正在连接照片文件夹…"
status.loadingPhotos             = en: "Loading photos…"                   | zh-CN: "正在加载照片…"
status.loadingMore               = en: "Loading more photos…"              | zh-CN: "正在加载更多照片…"
status.recovery                  = en: "RECOVERY"                          | zh-CN: "恢复"
status.projectMemo               = en: "PROJECT MEMO"                      | zh-CN: "项目备注"
status.updated                   = en: "UPDATED"                           | zh-CN: "已更新"
```

## Translation rules

```text
copy.buttons       = use short verbs; keep the action visible
copy.titles        = sentence case in English; natural Simplified Chinese in Chinese
copy.errors        = explain the next action, not only the failure
copy.counts        = use plural-aware English and Chinese-friendly count phrases
copy.productTerms  = keep "PhotoFlex" unchanged; translate Table as 工作台 and Sequence as 序列
copy.files         = never translate filenames, folder paths, project IDs, or backup JSON fields
copy.accessibility = translate aria-label, title, status, and dialog text as carefully as visible copy
```

## Implementation sequence

```text
1. Add a locale provider and `t(key, variables)` lookup with English fallback.
2. Add the language switcher to the Home-page header only.
3. Replace visible strings in Home, Project, Contact Sheet, Table, and Sequence.
4. Replace accessibility labels, status messages, dialogs, and recovery errors.
5. Add tests for locale persistence, fallback behavior, interpolation, and both language views.
6. Verify backup export/import remains byte-compatible regardless of the selected language.
```
