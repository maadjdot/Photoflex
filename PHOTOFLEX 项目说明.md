# PHOTOFLEX 项目说明
# 摄影项目创作与摄影书社区平台
## Project Workspace × Photobook Maker × Photography Community

**项目阶段：Concept / Pre-MVP**  
**产品类型：Web Application / Photography Creative Platform**  
**目标用户：业余摄影师、摄影爱好者、视觉创作者、摄影书爱好者**

---

# 1. 项目概述

本项目希望建立一个围绕**「摄影项目（Photography Project）」**而不是「单张照片」构建的摄影创作平台。

平台同时提供：

1. 照片项目管理
2. 视觉白板
3. 照片筛选与 Sequencing
4. 摄影书排版
5. 摄影项目发布
6. 社区讨论与反馈
7. 项目版本管理
8. PDF / 摄影书输出

最终形成一个完整工作流：

**整理照片 → 建立项目 → 形成摄影叙事 → 制作摄影书 → 发布项目 → 获得讨论 → 修改作品 → 完成摄影书**

本项目希望成为业余/专业摄影者建立、发展、制作和分享长期摄影项目的地方。


---

# 2. 为什么需要这个产品

今天摄影已经非常普及，普通摄影爱好者可能拥有：手机、相机，拍了数千甚至数万张照片，但是很少有软件把这些照片做成一本完整的摄影集

这个软件希望能够满足：
1. 摄影爱好者完成从单张照片向摄影项目转化的过程
2. 优化、支持专业摄影创作者的摄影项目创作流程
3. 给与作品一个能够被看到、并且讨论的平台

目前市面上给个人创作者展示完整摄影作品的机会并不多，很多时候只能够通过投稿出版社、摄影节、比赛等形式来展示，然而这些渠道的门槛较高，很多时候也受到审稿者们的口味影响；或者只能够在小红书、instagram等更加泛化的社交媒体上投稿，作品较难受到聚焦、专业的讨论，很多时候会收到很多不理解的声音。这个项目希望实现william eggleston所说的摄影的民主化，将创作完整项目这一行为也民主化，构建一个专属于摄影创作者们的展示与交流平台。

另外，当前关于摄影的软件大多关注于单张照片的编辑，或者单个版面的编辑，软件希望聚焦于项目全体的创作流程，已整个项目为单位进行管理，减少切换多个独立软件的摩擦，使创作者能够更加丝滑无阻力地进行创作，也减少照片在多个软件中转移中可能产生损坏的概率。
---

# 3. 当前工具的问题

目前摄影工作流高度碎片化。

一个摄影者可能的工作流程：

**Lightroom**：管理、筛选和调整照片。

↓

**文件夹 / Finder**：管理项目文件。

↓

**Milanote / PureRef / Storyflow / miro / sketch**：做 Moodboard 或视觉整理。

↓

**InDesign / Affinity Publisher**：制作摄影书。

↓

**Instagram / Behance / Reddit / 小红书 / 各大论坛**：分享作品并寻求反馈。

因此一个摄影项目经常分散在**5–8 个不同工具中。**

而且这些工具之间没有真正理解：**“这是同一个摄影项目”**

---

# 4. 市场机会

目前市场上的产品大致分成三类。

### A. 摄影社区

例如：

Instagram  
Glass  
Flickr

它们解决：

**Share Photos**

但核心内容单位通常仍然是：

**Photo / Post**

而不是：

**Photography Project**

---

### B. 摄影工作空间

例如：

Milanote  
Storyflow

它们解决：

**Moodboard / Planning / Visual Organization**

但通常不会继续进入真正的：

**Photobook Layout → Print Output**

---

### C. 摄影书制作软件

例如：

Fundy Designer  
SmartAlbums  
InDesign  
Affinity Publisher

它们解决：

**Book Layout / Album Design / Print**

但不会真正解决：

**Community + Project Development + Discussion**

因此存在一个明显的中间区域：

**Photography Project Workspace**

它同时连接：

**Organize + Create + Publish + Discuss**

---

# 5. 产品核心理念

整个产品围绕**Photography Project**建立：

例如：

---

### Taipei After Midnight

作者：@username

2025–2026

> 我开始在下班以后拍摄台北。
> 最初只是散步，后来逐渐发现夜晚城市中的人与白天完全不同。

状态：

**Work in Progress**

照片：

126

Selected：

47

Book：

Draft v0.4

最后更新：

3 days ago

---

一个 Project 可以持续：

一天、一个月、一年，甚至十年。

---

# 6. 核心数据结构

平台的基础结构可以定义为：

**User**

↓

**Project**

↓

Project 内部包含：

- Assets
- Collections
- Board
- Sequence
- Book
- Versions
- Updates
- Discussions

关系可以理解为：

**User → Project → Assets → Board → Sequence → Book → Published Project**

所有模块共享同一批照片。

因此用户不需要：

Export → Import → Export → Import。

照片始终属于同一个 Project。

---

# 7. 第一模块：Project

用户进入平台后首先看到的不是 Feed，而是：

# My Projects

例如：

**Taipei After Midnight**  
47 selected / 126 photos  
Book Draft v0.4

**My Father's House**  
23 selected / 312 photos  
Work in Progress

**Tokyo 2026**  
88 photos  
Collecting

Project 是整个产品的 Container。

每一个 Project 都有：

- Title
- Description
- Cover
- Location
- Date
- Tags
- Visibility
- Status
- Assets
- Board
- Sequence
- Book
- Discussion

---

# 8. 第二模块：Photo Library

用户可以向 Project 导入照片。

例如：

**Tokyo 2026**

Import：

823 Photos

系统生成 Project Library。

用户可以：

- Rating
- Favorite
- Reject
- Tag
- Group
- Filter
- Sort
- Search

例如：

**All — 823**

**Selected — 126**

**Book — 47**

**Rejected — 183**

Tag：

Night  
People  
Train  
Rain  
Street  
Portrait

第一阶段不需要成为 Lightroom。

平台不承担复杂 RAW Development。

用户可以继续：

Lightroom / Capture One → Export JPEG → Project

平台重点解决：

**Project Editing**

而不是：

**Photo Editing**

---

# 9. 第三模块：Visual Board

这是产品非常重要的核心功能。

用户可以把 Project 中的照片拖入一个：

# Infinite Canvas

例如：

**Taipei After Midnight**

在 Canvas 中：

IMG 032  
IMG 043  
IMG 102

组成：

**Night Workers**

另一组：

IMG 201  
IMG 233  
IMG 281

组成：

**Empty Streets**

用户可以：

- 自由移动照片
- 调整大小
- 建立 Group
- 写 Notes
- 添加 Text
- 建立 Connection
- 添加 Color Label
- 添加 Reference
- 添加章节

Board 的目的不是做漂亮 Moodboard。

而是：

> **帮助摄影者思考照片之间的关系。**

---

# 10. 第四模块：Sequence

当用户开始找到照片之间的关系以后，可以进入：

# Sequence View

这是摄影项目最关键的编辑阶段之一。

例如：

01  
IMG001

02  
IMG043

03  
IMG028

04  
IMG104

05  
IMG091

用户可以：

Drag & Drop

改变照片顺序。

可以同时看到：

20 / 40 / 80 张照片。

重点观察：

- Rhythm
- Repetition
- Contrast
- Color
- Subject
- Visual Transition
- Narrative

---

# 11. Board → Sequence

Board 和 Sequence 不应该是两个完全独立的软件。

例如用户在 Board 中选择：

12 张照片。

点击：

**Create Sequence**

系统直接生成一个 Sequence。

反过来，Sequence 中的照片也可以：

**Open on Board**

因此用户可以在：

**空间关系**

和：

**线性关系**

之间不断切换。

这是产品的重要交互特色。

---

# 12. 第五模块：Book Editor

当 Sequence 开始稳定后：

**Create Book**

系统根据 Sequence 创建摄影书。

进入：

# Spread Editor

例如：

**Pages 12–13**

左页：

一张竖幅照片。

右页：

留白。

下一 Spread：

一张横幅跨页。

用户可以：

- Drag Photo
- Resize Frame
- Crop
- Fit
- Fill
- Align
- Snap
- Grid
- Margin
- Bleed
- Background
- Text
- Page Number

但第一阶段不应该复制 InDesign。

核心目标：

> **让没有平面设计经验的摄影者也可以做出一本结构合理的摄影书。**

---

# 13. Layout System

系统提供基础 Layout：

Single Image

Two Images

Full Bleed

Diptych

Triptych

Image + Text

Contact Sheet

Blank Page

用户可以：

Shuffle Layout

系统根据：

- Photo Aspect Ratio
- Orientation
- Spread
- Margin
- Image Count

自动推荐合适布局。

---

# 14. Photography-first Design

Book Editor 应该围绕：

**照片**

而不是：

**Graphic Design**

设计。

因此 UI 应尽可能减少：

复杂工具栏、复杂 Panel、复杂 Layer。

用户看到的重点始终应该是：

**Spread + Photos**

而不是软件本身。

---

# 15. 第六模块：Book Overview

摄影书非常需要：

# Overview Mode

用户可以一次看到：

30–100 个 Spreads。

例如：

Cover

01  
02–03  
04–05  
06–07  
08–09  
...

用户可以直接拖动 Spread 改变顺序。

这让用户观察：

**整本书的节奏。**

而不是永远困在单个页面中。

---

# 16. 第七模块：Publish Project

这是本产品与普通摄影书软件最大的区别。

用户不需要完成摄影书以后才能发布。

Project 可以有不同状态：

**Collecting**

正在拍摄。

**Editing**

正在选片。

**Sequencing**

正在建立照片顺序。

**Book Draft**

正在制作摄影书。

**Completed**

项目完成。

因此：

> **创作过程本身也可以成为社区内容。**

---

# 17. Project Page

公开 Project Page 可以包含：

### Cover

Taipei After Midnight

by @username

2025–2026

---

### Project Statement

作者对项目的介绍。

---

### Selected Works

20–40 张代表照片。

---

### Sequence

查看完整照片序列。

---

### Photobook

在线翻阅摄影书。

---

### Updates

项目发展记录。

---

### Discussion

围绕整个项目展开讨论。

---

# 18. 项目版本

这里可以借鉴软件开发与学术预印本中的 Version 概念。

例如：

**v0.1**

Initial selection  
18 Photos

**v0.2**

New sequence  
27 Photos

**v0.3**

First book draft

**v0.4**

Changed Chapter II

**v1.0**

Final Book

用户可以查看：

**Version History**

甚至：

**Compare Versions**

---

# 19. Project Update

用户不需要每次发布完整作品。

可以发布：

# Project Update

例如：

**Taipei After Midnight · Update #6**

> 最近加入了这四张照片，但我不确定它们是否破坏了原来的节奏。

附：

4 Photos

或者：

> I'm struggling with this transition.

附：

Spread 18–21

社区可以直接针对这个问题讨论。

---

# 20. Discussion

Discussion 应该是产品最重要的社区功能之一。

它应该尽量减少：

“Nice!”

“Great shot!”

“🔥🔥🔥”

这样的低信息量互动。

而鼓励：

> 我觉得 IMG21 放在 IMG14 前面会更好，因为两张照片人物视线方向形成连续关系。

或者：

> Page 22–23 和前面的视觉节奏很相似，可以考虑删掉其中一个 Spread。

评论可以绑定到：

**Project**

**Photo**

**Sequence Position**

**Spread**

甚至：

**Book Version**

---

# 21. 社区设计原则

产品不应该复制 Instagram。

核心内容单位：

**Project**

而不是：

**Post**

核心行为：

**Develop**

而不是：

**Post**

核心互动：

**Discuss**

而不是：

**Like**

核心价值：

**Progress**

而不是：

**Followers**

---

# 22. Discover

社区首页可以叫：

# Discover

而不是 Feed。

主要展示：

### Featured Projects

编辑推荐。

### New Projects

最近创建。

### Recently Updated

最近持续更新的项目。

### Completed Books

已经完成摄影书的项目。

### Work in Progress

正在进行中的摄影项目。

---

# 23. 分类体系

用户可以探索：

Street

Documentary

Travel

Portrait

Family

Landscape

Architecture

Daily Life

Experimental

Archive

Personal

同时可以按照：

Location

Duration

Camera

Film / Digital

Book / Project

进行探索。

---

# 24. 不强调粉丝经济

平台可以有：

Follow Photographer

和：

Follow Project

但不应该把：

Follower Count

放在产品核心位置。

更重要的是：

**Follow Project**

例如：

用户发现：

**My Father's House**

非常感兴趣。

点击：

**Follow Project**

三个月以后作者发布：

**Book Draft v0.5**

用户重新回来继续阅读。

这样社区关系围绕：

**作品的发展**

而不是：

**Creator Popularity**

形成。

---

# 25. Appreciation

可以存在：

Appreciate

但公开页面不一定需要突出：

1,284 Likes

甚至可以考虑：

作者自己可以看到数据，

其他用户只看到：

**Appreciated by photographers**

从而降低社交排名压力。

---

# 26. 在线摄影书阅读器

发布后的摄影书应该可以直接：

# Read Book

使用模拟真实摄影书的阅读方式：

Cover

↓

Page 1

↓

Spread 2–3

↓

Spread 4–5

↓

...

可以选择：

Spread View

或：

Page View

用户因此不需要下载 PDF 才能体验作品。

---

# 27. 输出

Book 可以输出：

### Digital

Web Book

Share Link

Screen PDF

### Print

Print PDF

后期版本可以增加：

Bleed

Crop Marks

300 DPI Check

ICC Profile

PDF/X

Printer Presets

但这些不应该成为 MVP 的重点。

---

# 28. 社区与制作软件如何结合

这是整个项目最重要的一点。

不要做：

**Editor**

+

**Community**

两个互相独立的产品。

应该是：

**Community ↔ Workspace**

例如用户看到别人评论：

> IMG043 放在 IMG012 前面可能更好。

作者点击：

**Open in Sequence**

直接进入对应 Sequence。

修改完成以后：

**Save as v0.4**

然后：

**Publish Update**

社区看到：

**Taipei After Midnight updated to v0.4**

形成：

**Create → Share → Discuss → Revise → Share**

循环。

---

# 29. 产品飞轮

平台最终希望形成：

**Discover**

↓

看到优秀摄影项目

↓

**Inspiration**

产生自己的项目想法

↓

**Create Project**

↓

**Organize**

↓

**Board**

↓

**Sequence**

↓

**Book**

↓

**Publish**

↓

**Discussion**

↓

**Revision**

↓

**Better Project**

↓

重新进入 Discover

这才是产品真正的增长飞轮。

---

# 30. AI 的角色

AI 可以存在，但不应该成为产品核心卖点。

AI 应该：

**帮助摄影者思考。**

而不是：

**替摄影者创作。**

例如：

### AI Project Assistant

分析当前 Project：

“You have 86 selected images.”

发现：

大量重复照片。

建议：

“这 7 张照片视觉内容非常接近。”

但最终由用户选择。

---

# 31. AI Sequencing Assistant

AI 可以根据：

Color

Subject

Composition

Time

Location

Visual Similarity

帮助生成：

**Suggested Sequence**

但明确标记：

Suggestion。

用户可以：

Accept

Reject

Modify

---

# 32. AI Book Assistant

用户可以：

**Generate First Draft**

系统根据 Sequence：

自动生成基础摄影书。

例如：

48 Photos

↓

72 Pages

↓

生成：

20 Spreads

用户再人工修改。

AI 的作用是：

**消除 Blank Canvas。**

而不是自动生成最终作品。

---

# 33. AI Critique

未来可以增加：

# Ask for Critique

AI 不评价：

“照片好不好。”

而是分析：

- Sequence
- Repetition
- Visual Rhythm
- Spread Density
- Color Transition
- Narrative Structure

例如：

> 前 12 张照片主要以人物为主体，但 13–18 连续出现建筑空景，因此这里形成明显的章节转换。

这种 AI 更符合产品定位。

---

# 34. 用户画像

## Persona A

**摄影初学者**

拍照 1–2 年。

有：

Lightroom  
相机  
Instagram

但从来没有做过摄影项目。

需求：

> 我想从“拍漂亮照片”进入“做作品”。

---

## Persona B

**长期摄影爱好者**

已经拍摄：

5–10 年。

硬盘中：

50,000+ Photos。

需求：

> 我有很多照片，但从来没有认真整理成作品。

---

## Persona C

**第一次制作摄影书的人**

已经有一个 Series。

但打开 InDesign 后完全不知道怎么办。

需求：

> 我希望做一本真正属于自己的摄影书。

---

# 35. 产品定位

本产品不是：

**Instagram Alternative**

也不是：

**Lightroom Alternative**

也不是：

**InDesign Alternative**

也不是：

**Behance Alternative**

而是：

# Photography Project Platform

一个专门帮助摄影者：

**Develop photographic work over time.**

的平台。

---

# 36. MVP

第一版本必须非常克制。

## MVP 核心流程

**Sign Up**

↓

**Create Project**

↓

**Upload Photos**

↓

**Board**

↓

**Sequence**

↓

**Simple Book**

↓

**Publish Project**

↓

**Comment**

---

MVP 只需要证明一个问题：

> **摄影爱好者是否愿意在一个平台上，把零散照片整理成一个完整 Photography Project，并分享给其他摄影者讨论？**

---

# 37. MVP 必须实现

### Account

- Sign Up
- Login
- Profile

### Project

- Create
- Edit
- Delete
- Cover
- Description
- Visibility

### Assets

- Upload JPEG
- Thumbnail
- Favorite
- Rating
- Tag

### Board

- Infinite Canvas
- Drag Photo
- Resize
- Group
- Text
- Notes

### Sequence

- Drag & Drop
- Reorder
- Multi-select
- Create Sequence

### Book

- Spread
- Add Photo
- Move
- Crop
- Basic Layout
- Text
- Page reorder

### Publish

- Public Project Page
- Project Statement
- Selected Photos
- Book Viewer

### Community

- Discover
- Follow Project
- Comment
- Appreciate

---

# 38. MVP 暂时不做

第一阶段不要做：

RAW Processing

Photoshop 类编辑

复杂 DAM

CMYK Soft Proof

复杂 PDF/X

专业出版社投稿

摄影节投稿

Printer Marketplace

Print-on-demand

Marketplace

NFT

Private Messaging

Video Feed

Stories

Reels

复杂社交算法

复杂 AI 自动摄影书

这些都会严重扩大项目范围。

---

# 39. 第二阶段

当 MVP 验证成立以后增加：

Project Version

Project Updates

Inline Comments

Spread Comments

Collaborators

Advanced Book Layout

Typography

PDF Export

Print Presets

AI Sequence Suggestions

AI First Book Draft

---

# 40. 第三阶段

再进一步：

Collaborative Editing

Public Collections

Community Curation

Photography Groups

Reading Lists

Book Collections

Physical Printing

Printer Integration

Photobook Marketplace

Project Archive

---

# 41. 商业模式

产品可以采用：

# Freemium

免费用户：

- 3 Active Projects
- 基础 Board
- 基础 Sequence
- 基础 Book
- Community
- Public Project

Pro：

约：

**US$8–15 / month**

获得：

Unlimited Projects

Large Storage

Advanced Book Editor

High-resolution Export

PDF Print Export

Version History

Private Projects

Advanced Typography

AI Tools

---

# 42. 为什么社区应该免费

社区本身应该尽量降低进入门槛。

因为：

更多读者

↓

更多讨论

↓

更多摄影项目

↓

更高创作者价值

↓

更多人开始制作自己的 Project

↓

部分用户升级 Pro。

因此收费点最好主要围绕：

**Creation Tools**

而不是：

**Community Access**

---

# 43. 长期商业模式

未来还可以加入：

### Print

用户点击：

**Print My Book**

平台抽取印刷服务佣金。

### Premium Templates

摄影书设计模板。

### Storage

额外照片存储。

### Collaboration

多人编辑。

### Professional Portfolio

高级个人主页。

### Physical Book Marketplace

用户可以出售自己的摄影书。

但这些都应该建立在：

**Project Community 已经成立**

以后。

---

# 44. 品牌气质

产品视觉不应该像：

Instagram

Canva

Notion

传统 SaaS Dashboard。

更接近：

**独立摄影书 + 美术馆 + 编辑工作台。**

关键词：

Quiet

Editorial

Minimal

Photography-first

Thoughtful

Slow

Tactile

---

# 45. UI 原则

摄影永远是界面中视觉权重最高的东西。

因此：

大量留白。

中性色背景。

极少 Accent Color。

尽量减少 Card 边框。

弱化按钮。

弱化社交数字。

Typography 清晰但克制。

让：

**照片 > UI**

---

# 46. 产品首页

Landing Page 不需要强调：

“AI-powered creative platform”

而应该直接表达：

# Turn photographs into projects.

副标题：

**Organize your photographs, build sequences, make books, and share your work with people who care about photography.**

CTA：

**Start a Project**

第二 CTA：

**Explore Projects**

---

# 47. 核心差异

与 Instagram 的区别：

**Photo → Project**

与 Behance 的区别：

**Presentation → Creation**

与 Milanote 的区别：

**Board → Finished Photobook**

与 Storyflow 的区别：

**Private Workspace → Public Photography Community**

与 Fundy 的区别：

**Album Production → Photography Project Development**

与 InDesign 的区别：

**Professional DTP → Photography-first Creation**

---

# 48. 产品护城河

真正的护城河不是：

Book Editor。

因为排版功能可以被复制。

也不是：

Infinite Canvas。

因为 Canvas 已经非常成熟。

真正的护城河是：

# Project Graph

随着时间积累，平台拥有：

Photography Projects

+

Project Versions

+

Sequences

+

Books

+

Discussions

+

Collections

+

Relationships between photographers

也就是说：

**创作工具产生社区内容，社区又反过来促进创作。**

这是单纯 SaaS 工具很难建立的网络。

---

# 49. 最重要的产品原则

这个产品不应该帮助用户：

**发更多照片。**

而应该帮助用户：

**做更完整的作品。**

不应该优化：

**Engagement**

而应该优化：

**Project Completion。**

不应该问：

> 今天用户发了多少 Post？

应该问：

> 这个月有多少用户把 200 张照片整理成了一个 30 张照片的 Project？

以及：

> 有多少 Project 从 Collection 进入 Sequence，再从 Sequence 变成一本 Book？

这才是真正应该关注的指标。

---

# 50. North Star Metric

可以考虑：

# Completed / Meaningfully Updated Projects per Month

辅助指标：

Projects Created

Photos Added to Projects

Sequences Created

Books Created

Project Updates

Meaningful Comments

Project Followers

Projects Completed

Books Exported

而不是把：

Daily Likes

Daily Posts

Follower Growth

作为最核心指标。

---

# 51. 最终愿景

长期来看，这个平台希望建立一个新的摄影互联网内容单位：

# Photography Project

今天网络摄影最常见的单位是：

**Photo**

未来这个平台希望用户思考：

> “我正在做什么 Project？”

而不是：

> “我今天应该发什么照片？”

一个 17 岁刚开始摄影的人，可以建立：

**My Neighborhood**

一个旅行者可以建立：

**30 Days in Japan**

一个父亲可以建立：

**Growing Up**

一个街头摄影爱好者可以建立：

**Taipei After Midnight**

一个人可以花：

三个月、三年甚至十年，

持续更新同一个 Project。

最终它可能成为：

一个 Online Project，

一本 PDF，

一本实体摄影书，

也可能只是一个永远持续中的视觉档案。

平台不要求用户成为：

Professional Photographer。

也不要求作品达到：

Publisher / Festival / Gallery

标准。

唯一重要的是：

> **认真地把照片组织成作品，并让其他真正关心摄影的人看到它。**

因此，这个产品最终希望成为：

# The home for photographic projects.

一个摄影者可以：

**Collect.  
Think.  
Sequence.  
Make.  
Publish.  
Discuss.  
Revise.**

然后继续拍摄的地方。