(function () {
  "use strict";

  var seedPhotos = [
    { id: "P01", title: "河岸 01", meta: "35mm · 1/250", a: "#c05f48", b: "#f2c66d" },
    { id: "P02", title: "桥下 02", meta: "28mm · 1/60", a: "#34535d", b: "#88a9a3" },
    { id: "P03", title: "归途 03", meta: "50mm · 1/125", a: "#74514f", b: "#c99e74" },
    { id: "P04", title: "码头 04", meta: "35mm · 1/500", a: "#73848f", b: "#e4d7bd" },
    { id: "P05", title: "雨后 05", meta: "40mm · 1/80", a: "#405950", b: "#9caa73" },
    { id: "P06", title: "回望 06", meta: "50mm · 1/200", a: "#7e5842", b: "#dab581" },
    { id: "P07", title: "堤岸 07", meta: "28mm · 1/320", a: "#3d4a62", b: "#aab9ce" },
    { id: "P08", title: "渡口 08", meta: "35mm · 1/100", a: "#7e745c", b: "#d2bf8e" },
    { id: "P09", title: "远灯 09", meta: "50mm · 1/40", a: "#423c4c", b: "#b56d56" },
    { id: "P10", title: "清晨 10", meta: "35mm · 1/160", a: "#7e9290", b: "#e4cda5" },
    { id: "P11", title: "石阶 11", meta: "28mm · 1/90", a: "#595d50", b: "#bab29c" },
    { id: "P12", title: "对岸 12", meta: "40mm · 1/250", a: "#516a6f", b: "#d3ad7a" }
  ];
  var photos = seedPhotos.slice();
  var importedPhotoUrls = [];
  var importedLibraryName = "";
  var MAX_LIBRARY_PHOTOS = 500;
  var MAX_POOL_PHOTOS = 50;
  var CONTACT_PAGE_SIZE = 60;

  var stages = [
    {
      id: "contact",
      number: "01",
      label: "Contact Sheet",
      description: "选择照片加入 Pool"
    },
    {
      id: "sequence",
      number: "02",
      label: "Sequence + Pool",
      description: "从 Pool 取片并自由排序"
    },
    {
      id: "compare",
      number: "03",
      label: "Compare",
      description: "只比较当前版本与星标版本"
    }
  ];

  var state = createInitialState();
  var draggedPhotoId = null;
  var pointerInteraction = null;
  var suppressPhotoClick = false;

  function defaultModuleLayout() {
    return {
      sequence: { x: 0, y: 0, width: 75, height: 570 },
      pool: { x: 76, y: 0, width: 24, height: 570 }
    };
  }

  function createInitialState(skipDemo) {
    var initial = {
      stage: "contact",
      contactPage: 0,
      selected: [],
      pool: [],
      sequence: [],
      selectedSequenceIds: [],
      versions: [],
      starredVersionId: null,
      compareVersionId: null,
      workingFromVersionId: null,
      sequenceView: "horizontal",
      sequenceFrameHeight: 290,
      sequencePhotoSizes: {},
      moduleLayout: defaultModuleLayout(),
      whiteboard: false,
      whiteboardZoom: 0.75,
      whiteboardItems: {},
      whiteboardEntrySequence: [],
      whiteboardEntryItems: {},
      previewPhotoId: null,
      previewContextIds: [],
      previewSource: null,
      sequencePanorama: false,
      immersiveVersionId: null,
      libraryName: importedLibraryName,
      importedCount: importedLibraryName ? photos.length : 0,
      versionDraftName: "",
      notice: "先凭直觉选择照片，再把它们加入 Pool。"
    };
    if (typeof window === "undefined" || skipDemo || importedLibraryName) {
      return initial;
    }

    var query = new URLSearchParams(window.location.search);
    var demo = query.get("demo");
    if (demo === "sequence") {
      initial.stage = "sequence";
      initial.pool = ["P01", "P03", "P04", "P06", "P08", "P10"];
      initial.sequence = ["P03", "P01", "P06", "P04", "P08", "P10"];
      initial.notice = "验收预置状态：可直接检查 Pool 勾选与 Sequence 拖曳。";
    }
    if (demo === "compare") {
      initial.stage = "compare";
      initial.pool = ["P01", "P03", "P04", "P06", "P08", "P10"];
      initial.sequence = ["P03", "P01", "P06", "P08"];
      initial.versions = [
        {
          id: "v1",
          label: "安静开头",
          items: ["P01", "P03", "P04", "P06"],
          memo: "开头直接，但中段转场有些突然。"
        },
        {
          id: "v2",
          label: "人物先行",
          items: ["P03", "P01", "P06", "P08"],
          memo: "人物先出现后，进入河岸场景更自然。"
        },
        {
          id: "v3",
          label: "远灯收束",
          items: ["P03", "P06", "P08", "P09"],
          memo: "结尾更明确，但中间还需要一次呼吸。"
        }
      ];
      initial.starredVersionId = "v1";
      initial.compareVersionId = "v3";
      initial.notice = "验收预置状态：只显示星标基准与当前版本。";
      if (
        query.get("version") &&
        initial.versions.some(function (version) {
          return version.id === query.get("version");
        })
      ) {
        initial.immersiveVersionId = query.get("version");
      }
    }
    if (query.get("view") === "grid") {
      initial.sequenceView = "grid";
    }
    if (query.get("panorama") === "1" && initial.stage === "sequence") {
      initial.sequencePanorama = true;
    }
    if (
      (query.get("whiteboard") === "1" || query.get("immersive") === "1") &&
      initial.stage === "sequence"
    ) {
      initial.whiteboard = true;
      initial.whiteboardItems = createWhiteboardItems(initial.sequence);
    }
    if (
      query.get("preview") &&
      initial.sequence.indexOf(query.get("preview")) >= 0
    ) {
      initial.previewPhotoId = query.get("preview");
      initial.previewSource = "sequence";
    }
    return initial;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function photoById(id) {
    return photos.find(function (photo) {
      return photo.id === id;
    });
  }

  function versionById(id) {
    return state.versions.find(function (version) {
      return version.id === id;
    });
  }

  function uniqueIds(ids) {
    return ids.filter(function (id, index) {
      return ids.indexOf(id) === index;
    });
  }

  function photoThumb(photo) {
    return (
      '<span class="photo-thumb' +
      (photo.url ? " is-local" : "") +
      '" style="--tone-a:' +
      (photo.a || "#252a27") +
      ";--tone-b:" +
      (photo.b || "#808780") +
      '">' +
      (photo.url
        ? '<img src="' +
          escapeHtml(photo.url) +
          '" alt="" loading="lazy" decoding="async">'
        : "") +
      "</span>"
    );
  }

  function largePhoto(photo, className) {
    return (
      '<div class="' +
      className +
      (photo.url ? " is-local" : "") +
      '" style="--tone-a:' +
      (photo.a || "#252a27") +
      ";--tone-b:" +
      (photo.b || "#808780") +
      '">' +
      (photo.url
        ? '<img src="' +
          escapeHtml(photo.url) +
          '" alt="' +
          escapeHtml(photo.title) +
          '" decoding="async" draggable="false">'
        : "") +
      "</div>"
    );
  }

  function previewContextIds(context) {
    if (context === "contact") {
      return photos.map(function (photo) {
        return photo.id;
      });
    }
    if (context === "pool") return state.pool.slice();
    return state.sequence.slice();
  }

  function formatFileSize(bytes) {
    if (!bytes) return "大小未知";
    if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  function revokeImportedPhotoUrls() {
    if (typeof URL === "undefined" || !URL.revokeObjectURL) return;
    importedPhotoUrls.forEach(function (url) {
      URL.revokeObjectURL(url);
    });
    importedPhotoUrls = [];
  }

  function importLocalJpegs(fileList) {
    var allFiles = Array.prototype.slice.call(fileList || []);
    var jpegFiles = allFiles
      .filter(function (file) {
        return (
          (file.type && file.type.toLowerCase() === "image/jpeg") ||
          /\.jpe?g$/i.test(file.name || "")
        );
      })
      .sort(function (left, right) {
        var leftPath = left.webkitRelativePath || left.name || "";
        var rightPath = right.webkitRelativePath || right.name || "";
        return leftPath.localeCompare(rightPath, undefined, { numeric: true });
      });

    if (!jpegFiles.length) {
      state.notice = "这个文件夹里没有可读取的 JPEG；请选择包含 .jpg 或 .jpeg 的文件夹。";
      render();
      return;
    }

    var limitedFiles = jpegFiles.slice(0, MAX_LIBRARY_PHOTOS);
    revokeImportedPhotoUrls();
    photos = limitedFiles.map(function (file, index) {
      var objectUrl = URL.createObjectURL(file);
      importedPhotoUrls.push(objectUrl);
      return {
        id: "L" + String(index + 1).padStart(3, "0"),
        title: file.name,
        meta: "本地 JPEG · " + formatFileSize(file.size),
        url: objectUrl,
        local: true
      };
    });
    var firstPath = limitedFiles[0].webkitRelativePath || "";
    importedLibraryName = firstPath.indexOf("/") >= 0
      ? firstPath.split("/")[0]
      : "本地 JPEG 选择";
    state = createInitialState(true);
    state.notice =
      "已从“" +
      importedLibraryName +
      "”读取 " +
      photos.length +
      " 张 JPEG" +
      (jpegFiles.length > MAX_LIBRARY_PHOTOS
        ? "；为本轮研究只使用前 500 张。"
        : "。") +
      " 可选择最多 50 张加入 Pool。";
    render();
  }

  function sequencePhotoSize(id) {
    return state.sequencePhotoSizes[id] || 190;
  }

  function moduleStyle(name) {
    var layout = state.moduleLayout[name];
    return (
      "--module-x:" +
      layout.x +
      "%;--module-y:" +
      layout.y +
      "px;--module-width:" +
      layout.width +
      "%;--module-height:" +
      layout.height +
      "px;"
    );
  }

  function editorCanvasHeight() {
    return Math.max(
      state.moduleLayout.sequence.y + state.moduleLayout.sequence.height,
      state.moduleLayout.pool.y + state.moduleLayout.pool.height
    );
  }

  function createWhiteboardItems(ids) {
    var items = {};
    ids.forEach(function (id, index) {
      items[id] = {
        x: 120 + (index % 10) * 250,
        y: 150 + Math.floor(index / 10) * 330,
        width: 200,
        height: 280
      };
    });
    return items;
  }

  function ensureWhiteboardItems() {
    state.sequence.forEach(function (id, index) {
      if (state.whiteboardItems[id]) return;
      state.whiteboardItems[id] = {
        x: 120 + (index % 10) * 250,
        y: 150 + Math.floor(index / 10) * 330,
        width: 200,
        height: 280
      };
    });
    Object.keys(state.whiteboardItems).forEach(function (id) {
      if (state.sequence.indexOf(id) < 0) delete state.whiteboardItems[id];
    });
  }

  function canOpenStage(stageId) {
    if (stageId === "contact") return true;
    if (stageId === "sequence") return state.pool.length > 0;
    return comparisonVersions().length === 2;
  }

  function topStageNavigation() {
    return (
      '<nav class="stage-navigation" aria-label="PhotoFlex 工作阶段">' +
      stages
        .map(function (stage) {
          var active = state.stage === stage.id;
          var enabled = canOpenStage(stage.id);
          return (
            '<button class="stage-button' +
            (active ? " is-active" : "") +
            '" type="button" data-action="goto-stage" data-stage="' +
            stage.id +
            '"' +
            (enabled ? "" : " disabled") +
            '><span class="stage-number">' +
            stage.number +
            '</span><span class="stage-copy"><strong>' +
            escapeHtml(stage.label) +
            "</strong><small>" +
            escapeHtml(stage.description) +
            "</small></span></button>"
          );
        })
        .join("") +
      "</nav>"
    );
  }

  function pageHeading() {
    var copy = {
      contact: {
        eyebrow: "建立候选池",
        title: "Contact Sheet",
        lede: "选择属于同一个故事的照片。已经进入 Pool 的照片会变成灰阶，避免重复选择。"
      },
      sequence: {
        eyebrow: "编辑工作序列",
        title: "Sequence + Pool",
        lede: "右侧管理 Pool，勾选照片加入左侧 Sequence；拖动左侧照片即可改变叙事顺序。"
      },
      compare: {
        eyebrow: "版本判断",
        title: "Compare",
        lede: "画面只保留两个版本。星标版本始终是比较基准，Memo 用来记录你的判断。"
      }
    };
    var current = copy[state.stage];
    var headingCopy =
      '<div class="heading-copy"><p class="eyebrow">' +
      escapeHtml(current.eyebrow) +
      '</p><h1>' +
      escapeHtml(current.title) +
      '</h1><p class="page-lede">' +
      escapeHtml(current.lede) +
      "</p></div>";
    if (state.stage === "compare") {
      return (
        '<div class="page-heading compare-page-heading">' +
        headingCopy +
        versionShelf() +
        "</div>"
      );
    }
    return '<div class="page-heading">' + headingCopy + "</div>";
  }

  function contactPageCount() {
    return Math.max(1, Math.ceil(photos.length / CONTACT_PAGE_SIZE));
  }

  function contactPagePhotos() {
    var safePage = clamp(state.contactPage, 0, contactPageCount() - 1);
    state.contactPage = safePage;
    var start = safePage * CONTACT_PAGE_SIZE;
    return photos.slice(start, start + CONTACT_PAGE_SIZE);
  }

  function contactPhotoCard(photo) {
    var selected = state.selected.indexOf(photo.id) >= 0;
    var inPool = state.pool.indexOf(photo.id) >= 0;
    var classes = "contact-photo";
    if (selected) classes += " is-selected";
    if (inPool) classes += " is-in-pool";

    return (
      '<article class="' +
      classes +
      '" data-photo-id="' +
      photo.id +
      '"><button class="contact-selection-surface" type="button" data-action="toggle-contact-photo" data-id="' +
      photo.id +
      '" aria-pressed="' +
      selected +
      '"' +
      (inPool ? " disabled" : "") +
      ">" +
      photoThumb(photo) +
      '<div class="contact-card-copy"><span class="photo-name">' +
      escapeHtml(photo.title) +
      '</span><span class="photo-meta">' +
      escapeHtml(photo.meta) +
      " · " +
      photo.id +
      '</span></div></button><span class="selection-mark">✓</span><span class="pool-mark">已在 Pool</span><div class="contact-card-actions"><button class="photo-preview-control" type="button" data-action="open-context-photo-preview" data-context="contact" data-id="' +
      photo.id +
      '" aria-label="预览完整大图 ' +
      escapeHtml(photo.title) +
      '">预览大图</button></div></article>'
    );
  }

  function contactContent() {
    var pagePhotos = contactPagePhotos();
    var pageCount = contactPageCount();
    var buttonLabel = state.pool.length
      ? "再加入 Pool（" + state.selected.length + "）"
      : "加入 Pool（" + state.selected.length + "）";
    return (
      '<section class="contact-stage">' +
      '<section class="library-import-panel"><div><p class="eyebrow">PH0-UX-05 · 本地研究图库</p><strong>' +
      (state.importedCount
        ? "已载入 “" + escapeHtml(state.libraryName) + "”"
        : "读取参与者的 JPEG 文件夹") +
      "</strong><span>浏览器只建立本地 Object URL，不上传、不复制为 Base64；单次最多读取 500 张。</span></div>" +
      '<label class="folder-import-button">选择本地 JPEG 文件夹<input type="file" data-role="local-jpeg-folder" accept=".jpg,.jpeg,image/jpeg" multiple webkitdirectory directory></label></section>' +
      '<div class="contact-summary"><span>图库 ' +
      photos.length +
      " 张</span><span>本次选择 " +
      state.selected.length +
      " 张</span><span>Pool " +
      state.pool.length +
      " / " +
      MAX_POOL_PHOTOS +
      '</span></div><div class="bulk-toolbar"><div><strong>本页选择</strong><span>单击整张照片勾选；“预览大图”不会改变选择</span></div><div class="bulk-toolbar-actions"><button type="button" data-action="select-contact-page">全选本页</button><button type="button" data-action="invert-contact-page">反选本页</button></div></div>' +
      '<div class="contact-grid">' +
      pagePhotos.map(contactPhotoCard).join("") +
      '</div><nav class="contact-pagination" aria-label="Contact Sheet 分页"><button type="button" data-action="change-contact-page" data-direction="-1"' +
      (state.contactPage === 0 ? " disabled" : "") +
      '>← 上一页</button><span>第 ' +
      (state.contactPage + 1) +
      " / " +
      pageCount +
      " 页 · 每页最多 " +
      CONTACT_PAGE_SIZE +
      ' 张</span><button type="button" data-action="change-contact-page" data-direction="1"' +
      (state.contactPage >= pageCount - 1 ? " disabled" : "") +
      ">下一页 →</button></nav>" +
      '<div class="stage-actions"><button class="btn btn-primary" type="button" data-action="add-to-pool"' +
      (state.selected.length ? "" : " disabled") +
      ">" +
      buttonLabel +
      '</button><span class="action-hint">' +
      escapeHtml(state.notice) +
      "</span></div></section>"
    );
  }

  function sequenceItem(id, index) {
    var photo = photoById(id);
    var bulkSelected = state.selectedSequenceIds.indexOf(id) >= 0;
    return (
      '<article class="sequence-card' +
      (bulkSelected ? " is-bulk-selected" : "") +
      '" draggable="true" data-drag-id="' +
      id +
      '" data-drop-id="' +
      id +
      '" style="--sequence-photo-size:' +
      sequencePhotoSize(id) +
      'px"><span class="sequence-position">' +
      (index + 1) +
      '</span><span class="drag-handle" aria-hidden="true">⠿</span>' +
      '<button class="sequence-photo-open" type="button" data-action="open-photo-preview" data-id="' +
      id +
      '" aria-label="大图预览 ' +
      escapeHtml(photo.title) +
      '">' +
      photoThumb(photo) +
      "</button>" +
      '<div class="sequence-card-footer"><span><strong>' +
      escapeHtml(photo.title) +
      "</strong><small>" +
      photo.id +
      '</small></span><span class="photo-card-actions"><button class="sequence-select-toggle" type="button" data-action="toggle-sequence-selection" data-id="' +
      id +
      '" aria-pressed="' +
      bulkSelected +
      '" aria-label="选择 ' +
      escapeHtml(photo.title) +
      '">' +
      (bulkSelected ? "✓" : "○") +
      '</button><button class="remove-from-sequence" type="button" data-action="toggle-sequence-photo" data-id="' +
      id +
      '" aria-label="从 Sequence 移除 ' +
      escapeHtml(photo.title) +
      '">×</button></span></div>' +
      resizeHandles("sequence-photo", id) +
      "</article>"
    );
  }

  function resizeHandles(kind, id) {
    return (
      ["nw", "ne", "sw", "se"]
        .map(function (corner) {
          return (
            '<span class="resize-corner resize-' +
            corner +
            '" data-resize-kind="' +
            kind +
            '" data-corner="' +
            corner +
            '"' +
            (id ? ' data-id="' + id + '"' : "") +
            ' aria-hidden="true"></span>'
          );
        })
        .join("")
    );
  }

  function moduleChrome(name, label) {
    return (
      '<button class="module-drag-handle" type="button" data-module-drag-handle="' +
      name +
      '" aria-label="拖动 ' +
      escapeHtml(label) +
      ' 模块"><span aria-hidden="true">⠿</span> 拖动 ' +
      escapeHtml(label) +
      "</button>" +
      resizeHandles("module", name)
    );
  }

  function poolPhotoCard(id) {
    var photo = photoById(id);
    var inSequence = state.sequence.indexOf(id) >= 0;
    return (
      '<article class="pool-card' +
      (inSequence ? " is-in-sequence" : "") +
      '"><button class="pool-selection-surface" type="button" data-action="toggle-sequence-photo" data-id="' +
      id +
      '" aria-pressed="' +
      inSequence +
      '"><span class="pool-checkbox">' +
      (inSequence ? "✓" : "") +
      "</span>" +
      photoThumb(photo) +
      '<span class="photo-name">' +
      escapeHtml(photo.title) +
      '</span></button><div class="pool-card-actions"><button class="photo-preview-control" type="button" data-action="open-context-photo-preview" data-context="pool" data-id="' +
      id +
      '" aria-label="预览完整大图 ' +
      escapeHtml(photo.title) +
      '">预览大图</button><button class="pool-remove" type="button" data-action="remove-pool-photo" data-id="' +
      id +
      '" aria-label="从 Pool 删除 ' +
      escapeHtml(photo.title) +
      '">×</button></div></article>'
    );
  }

  function versionShelf() {
    return (
      '<aside class="version-shelf"><span class="version-shelf-label">Saved versions</span><div class="version-pack-list">' +
      state.versions
        .map(function (version) {
          var starred = version.id === state.starredVersionId;
          var comparing = version.id === state.compareVersionId;
          return (
            '<button class="version-pack' +
            (starred ? " is-starred" : "") +
            (comparing ? " is-comparing" : "") +
            '" type="button" data-action="select-compare-version" data-id="' +
            version.id +
            '"' +
            (starred ? " disabled" : "") +
            '><span class="version-pack-icon">' +
            (starred ? "★" : "▰") +
            '</span><span class="version-pack-copy"><strong>' +
            escapeHtml(version.label) +
            "</strong><small>" +
            (starred ? "星标基准" : comparing ? "正在比较" : "点击比较") +
            "</small></span></button>"
          );
        })
        .join("") +
      "</div></aside>"
    );
  }

  function sequenceContent() {
    var saveLabel = state.versions.length
      ? "保存新版本"
      : "保存首个版本并自动打星";
    var origin = state.workingFromVersionId
      ? '<span class="working-copy">工作副本来自 ' +
        escapeHtml(state.workingFromVersionId.toUpperCase()) +
        "；保存时不会覆盖原版本。</span>"
      : "";

    return (
      '<section class="editor-layout" style="--editor-canvas-height:' +
      editorCanvasHeight() +
      'px">' +
      '<div class="sequence-column" data-module="sequence" style="' +
      moduleStyle("sequence") +
      '">' +
      '<header class="column-heading"><div><p class="eyebrow">序列模块</p><h2>Sequence <span>' +
      state.sequence.length +
      '</span></h2></div>' +
      '<div class="sequence-tools">' +
      origin +
      '<div class="sequence-mode-actions"><button class="btn btn-primary" type="button" data-action="toggle-whiteboard"' +
      (state.sequence.length ? "" : " disabled") +
      '>进入白板</button><button class="btn btn-secondary" type="button" data-action="open-sequence-panorama"' +
      (state.sequence.length ? "" : " disabled") +
      ">进入序列全景</button></div>" +
      '<div class="view-toggle" role="group" aria-label="Sequence 视角"><button class="' +
      (state.sequenceView === "horizontal" ? "is-active" : "") +
      '" type="button" data-action="set-sequence-view" data-view="horizontal">横向</button><button class="' +
      (state.sequenceView === "grid" ? "is-active" : "") +
      '" type="button" data-action="set-sequence-view" data-view="grid">网格</button></div></div>' +
      '</header><div class="bulk-toolbar bulk-toolbar-compact"><div><strong>Sequence 选择 ' +
      state.selectedSequenceIds.length +
      ' 张</strong><span>用于批量移除，也会同步到白板选择</span></div><div class="bulk-toolbar-actions"><button type="button" data-action="select-all-sequence">全选</button><button type="button" data-action="invert-sequence-selection">反选</button><button class="is-danger" type="button" data-action="remove-selected-sequence"' +
      (state.selectedSequenceIds.length ? "" : " disabled") +
      '>移除选中</button></div></div><div class="sequence-viewport"><div class="sequence-board view-' +
      state.sequenceView +
      '" data-sequence-dropzone="true" style="--sequence-frame-height:' +
      state.sequenceFrameHeight +
      'px">' +
      (state.sequence.length
        ? state.sequence.map(sequenceItem).join("")
        : '<div class="empty-sequence"><strong>Sequence 还没有照片</strong><span>勾选右侧 Pool 中的任意照片开始，不限制张数。</span></div>') +
      '</div>' +
      (state.sequenceView === "horizontal"
        ? '<div class="sequence-scroll-controls"><button type="button" data-action="scroll-sequence" data-direction="-1" aria-label="向左滚动 Sequence">←</button><span>横向滚动</span><button type="button" data-action="scroll-sequence" data-direction="1" aria-label="向右滚动 Sequence">→</button></div>'
        : "") +
      '</div><div class="version-save-bar"><label for="version-name">版本名称</label><input id="version-name" type="text" data-role="version-name" value="' +
      escapeHtml(state.versionDraftName) +
      '" placeholder="例如：更安静的开头"><button class="btn btn-primary" type="button" data-action="save-version"' +
      (state.sequence.length ? "" : " disabled") +
      ">" +
      saveLabel +
      '</button></div><div class="stage-actions compact-actions"><span class="action-hint">' +
      escapeHtml(state.notice) +
      '</span></div></div>' +
      '<aside class="pool-column" data-module="pool" style="' +
      moduleStyle("pool") +
      '">' +
      moduleChrome("pool", "Pool") +
      '<header class="column-heading"><div><p class="eyebrow">候选池 · 内容独立滚动</p><h2>Pool <span>' +
      state.pool.length +
      " / " +
      MAX_POOL_PHOTOS +
      '</span></h2></div><div class="pool-heading-actions"><button type="button" data-action="select-all-pool">全选</button><button type="button" data-action="invert-pool-selection">反选</button><button class="text-button" type="button" data-action="goto-stage" data-stage="contact">添加照片</button></div></header><span class="pool-preview-hint">单击照片加入或移出 Sequence；“预览大图”只负责预览</span>' +
      '<div class="pool-grid">' +
      state.pool.map(poolPhotoCard).join("") +
      "</div></aside></section>"
    );
  }

  function comparisonVersions() {
    var starred = versionById(state.starredVersionId);
    var other = versionById(state.compareVersionId);
    if (!other || (starred && other.id === starred.id)) {
      other = state.versions
        .slice()
        .reverse()
        .find(function (version) {
          return !starred || version.id !== starred.id;
        });
    }
    return [starred, other].filter(Boolean);
  }

  function versionPreview(version) {
    return (
      '<div class="version-photo-grid">' +
      version.items
        .map(function (id, index) {
          var photo = photoById(id);
          return (
            '<div class="version-photo"><span class="version-photo-number">' +
            (index + 1) +
            "</span>" +
            photoThumb(photo) +
            "</div>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function compareVersionRow(version) {
    var starred = version.id === state.starredVersionId;
    return (
      '<article class="compare-row' +
      (starred ? " is-starred" : "") +
      '"><section class="version-panel"><header><h2>' +
      escapeHtml(version.label) +
      '</h2><button class="star-button' +
      (starred ? " is-starred" : "") +
      '" type="button" data-action="star-version" data-id="' +
      version.id +
      '" aria-pressed="' +
      starred +
      '">' +
      (starred ? "★ 已设为比较基准" : "☆ 设为喜欢的版本") +
      '</button></header><button class="version-open" type="button" data-action="open-version-preview" data-id="' +
      version.id +
      '" aria-label="沉浸预览 ' +
      escapeHtml(version.label) +
      '">' +
      versionPreview(version) +
      '<span class="open-version-hint">点击进入沉浸预览 →</span></button><div class="version-panel-actions"><button class="open-version-edit" type="button" data-action="edit-version" data-id="' +
      version.id +
      '">打开版本，返回 Sequence 继续排序 →</button></div></section>' +
      '<aside class="version-memo"><label for="memo-' +
      version.id +
      '">Memo</label><textarea id="memo-' +
      version.id +
      '" data-role="version-memo" data-version-id="' +
      version.id +
      '" placeholder="这个版本为什么成立？还想改变什么？">' +
      escapeHtml(version.memo) +
      "</textarea></aside></article>"
    );
  }

  function compareContent() {
    var pair = comparisonVersions();
    if (pair.length < 2) {
      return (
        '<div class="empty-compare"><strong>还需要另一个版本</strong><span>回到 Sequence 调整顺序并再次保存，才能开始比较。</span>' +
        '<button class="btn btn-primary" type="button" data-action="goto-stage" data-stage="sequence">返回 Sequence</button></div>'
      );
    }
    return (
      '<section class="compare-stack">' +
      pair.map(compareVersionRow).join("") +
      "</section>"
    );
  }

  function whiteboardItem(id, index) {
    var photo = photoById(id);
    var item = state.whiteboardItems[id];
    var selected = state.selectedSequenceIds.indexOf(id) >= 0;
    return (
      '<article class="whiteboard-item' +
      (selected ? " is-selected" : "") +
      '" data-whiteboard-item="' +
      id +
      '" style="left:' +
      item.x +
      "px;top:" +
      item.y +
      "px;width:" +
      item.width +
      "px;height:" +
      item.height +
      'px"><span class="whiteboard-position">' +
      (index + 1) +
      '</span><button class="whiteboard-remove" type="button" data-action="remove-whiteboard-photo" data-id="' +
      id +
      '" aria-label="从白板和 Sequence 移除 ' +
      escapeHtml(photo.title) +
      '">×</button><button class="whiteboard-drag-surface" type="button" data-action="open-photo-preview" data-whiteboard-drag-handle="' +
      id +
      '" data-id="' +
      id +
      '" aria-label="拖动；点击大图预览 ' +
      escapeHtml(photo.title) +
      '">' +
      photoThumb(photo) +
      "</button>" +
      resizeHandles("whiteboard-photo", id) +
      "</article>"
    );
  }

  function whiteboardBounds() {
    var items = Object.keys(state.whiteboardItems).map(function (id) {
      return state.whiteboardItems[id];
    });
    return {
      width: Math.max.apply(
        null,
        [5200].concat(
          items.map(function (item) {
            return item.x + item.width + 220;
          })
        )
      ),
      height: Math.max.apply(
        null,
        [3600].concat(
          items.map(function (item) {
            return item.y + item.height + 220;
          })
        )
      )
    };
  }

  function whiteboardContent() {
    ensureWhiteboardItems();
    var bounds = whiteboardBounds();
    var scaledWidth = Math.round(bounds.width * state.whiteboardZoom);
    var scaledHeight = Math.round(bounds.height * state.whiteboardZoom);
    return (
      '<main class="whiteboard-mode"><div class="whiteboard-toolbar"><span><strong>Sequence 白板</strong> · ' +
      state.sequence.length +
      ' 张 · 已选 ' +
      state.selectedSequenceIds.length +
      ' 张</span><span>框选多张 · 拖动选中组 · 右键拖动视角</span><div class="whiteboard-zoom-controls" role="group" aria-label="白板视角缩放"><button type="button" data-action="zoom-whiteboard" data-direction="-1" aria-label="缩小白板视角">−</button><strong>' +
      Math.round(state.whiteboardZoom * 100) +
      '%</strong><button type="button" data-action="zoom-whiteboard" data-direction="1" aria-label="放大白板视角">＋</button><button type="button" data-action="reset-whiteboard-view">重置视角</button></div><div class="whiteboard-bulk-actions"><button type="button" data-action="remove-whiteboard-selection"' +
      (state.selectedSequenceIds.length ? "" : " disabled") +
      '>移除选中</button><button class="whiteboard-discard" type="button" data-action="exit-whiteboard-discard">放弃改动退出</button><button class="whiteboard-exit" type="button" data-action="exit-whiteboard-save">保留排序退出</button></div></div><div class="whiteboard-viewport"><div class="whiteboard-space" style="width:' +
      scaledWidth +
      "px;height:" +
      scaledHeight +
      'px"><section class="whiteboard-canvas" aria-label="Sequence 自由白板" style="width:' +
      bounds.width +
      "px;height:" +
      bounds.height +
      "px;--whiteboard-zoom:" +
      state.whiteboardZoom +
      '"><div class="whiteboard-selection-box" aria-hidden="true"></div>' +
      state.sequence.map(whiteboardItem).join("") +
      "</section></div></div></main>"
    );
  }

  function panoramaItem(id, index) {
    var photo = photoById(id);
    var size = Math.round(sequencePhotoSize(id) * 1.25);
    return (
      '<article class="panorama-item" style="--panorama-size:' +
      size +
      'px"><span class="panorama-position">' +
      (index + 1) +
      '</span><button type="button" data-action="open-panorama-photo" data-id="' +
      id +
      '" aria-label="完整预览 ' +
      escapeHtml(photo.title) +
      '">' +
      photoThumb(photo) +
      "</button></article>"
    );
  }

  function panoramaContent(ids, title, eyebrow, exitAction) {
    return (
      '<main class="sequence-panorama-mode"><header class="panorama-toolbar"><div><span>' +
      escapeHtml(eyebrow) +
      " · " +
      ids.length +
      " 张</span><strong>" +
      escapeHtml(title) +
      '</strong></div><span>照片为 Sequence 模块尺寸的 1.25 倍 · 点击照片查看完整大图</span><button type="button" data-action="' +
      exitAction +
      '">退出序列全景</button></header><section class="panorama-strip" aria-label="照片序列全景">' +
      ids.map(panoramaItem).join("") +
      "</section></main>"
    );
  }

  function immersiveVersionContent() {
    var version = versionById(state.immersiveVersionId);
    if (!version || !version.items.length) return "";
    return panoramaContent(
      version.items,
      version.label,
      "Compare 版本序列全景",
      "close-version-preview"
    );
  }

  function previewActionControls(photoId) {
    var source = state.previewSource || "sequence";
    var isContact = source === "contact";
    var isReadOnly = source === "compare";
    var selected = isContact
      ? state.selected.indexOf(photoId) >= 0
      : state.sequence.indexOf(photoId) >= 0;
    var unavailableInContact =
      isContact && state.pool.indexOf(photoId) >= 0;
    var status = isReadOnly
      ? "已保存版本只读"
      : isContact
        ? "操作 Contact 本次选择"
        : "操作当前 Sequence";
    return (
      '<div class="preview-actions"><span>' +
      status +
      '</span><button class="preview-select-photo" type="button" data-action="preview-select-photo"' +
      (selected || isReadOnly || unavailableInContact ? " disabled" : "") +
      ">" +
      (selected ? "✓ 已选择" : "选择照片") +
      '</button><button class="preview-remove-photo" type="button" data-action="preview-remove-photo"' +
      (!selected || isReadOnly ? " disabled" : "") +
      ">移除照片</button></div>"
    );
  }

  function photoPreview() {
    if (!state.previewPhotoId) return "";
    var previewIds = state.previewContextIds.length
      ? state.previewContextIds
      : state.sequence;
    var index = previewIds.indexOf(state.previewPhotoId);
    if (index < 0) return "";
    var photo = photoById(state.previewPhotoId);
    return (
      '<div class="photo-preview" role="dialog" aria-modal="true" aria-label="照片大图预览"><button class="preview-backdrop" type="button" data-action="close-photo-preview" aria-label="关闭大图预览"></button><section class="preview-dialog"><header><span>' +
      (index + 1) +
      " / " +
      previewIds.length +
      '</span><strong>' +
      escapeHtml(photo.title) +
      '</strong><button type="button" data-action="close-photo-preview" aria-label="关闭大图预览">×</button></header><div class="preview-stage"><button class="preview-arrow preview-arrow-left" type="button" data-action="step-photo-preview" data-direction="-1"' +
      (index === 0 ? " disabled" : "") +
      ' aria-label="上一张照片">←</button>' +
      largePhoto(photo, "preview-photo") +
      '<button class="preview-arrow preview-arrow-right" type="button" data-action="step-photo-preview" data-direction="1"' +
      (index === previewIds.length - 1 ? " disabled" : "") +
      ' aria-label="下一张照片">→</button></div><footer><span class="preview-meta">' +
      escapeHtml(photo.meta) +
      " · " +
      photo.id +
      '</span>' +
      previewActionControls(photo.id) +
      '<span class="preview-shortcuts">键盘 ← → 浏览 · Esc 退出</span></footer></section></div>'
    );
  }

  function stageContent() {
    if (state.stage === "contact") return contactContent();
    if (state.stage === "sequence") return sequenceContent();
    return compareContent();
  }

  function render() {
    var content = state.whiteboard
      ? whiteboardContent()
      : state.sequencePanorama
        ? panoramaContent(
            state.sequence,
            "当前工作序列",
            "Sequence 序列全景",
            "close-sequence-panorama"
          )
      : state.immersiveVersionId
        ? immersiveVersionContent()
      : '<div class="prototype-shell"><header class="app-header"><div class="brand-block"><span class="prototype-flag">Prototype · Memory only</span><span class="project-name">河流向北</span></div>' +
        topStageNavigation() +
        '<button class="reset-button" type="button" data-action="reset">重新开始</button></header><main class="app-main">' +
        pageHeading() +
        stageContent() +
        "</main></div>";
    document.getElementById("app").innerHTML = content + photoPreview();
  }

  function gotoStage(stageId) {
    if (!canOpenStage(stageId)) return;
    state.stage = stageId;
    state.whiteboard = false;
    state.previewPhotoId = null;
    state.previewContextIds = [];
    state.previewSource = null;
    state.sequencePanorama = false;
    state.immersiveVersionId = null;
    render();
  }

  function changeContactPage(direction) {
    state.contactPage = clamp(
      state.contactPage + Number(direction),
      0,
      contactPageCount() - 1
    );
    render();
  }

  function bulkSelectContactPage(invert) {
    var pageIds = contactPagePhotos()
      .map(function (photo) {
        return photo.id;
      })
      .filter(function (id) {
        return state.pool.indexOf(id) < 0;
      });
    var next = state.selected.slice();
    pageIds.forEach(function (id) {
      var selectedIndex = next.indexOf(id);
      if (invert && selectedIndex >= 0) {
        next.splice(selectedIndex, 1);
        return;
      }
      if (selectedIndex < 0 && state.pool.length + next.length < MAX_POOL_PHOTOS) {
        next.push(id);
      }
    });
    state.selected = next;
    state.notice =
      (invert ? "已反选本页；" : "已全选本页可加入的照片；") +
      "当前共选择 " +
      state.selected.length +
      " 张，Pool 上限为 50 张。";
    render();
  }

  function toggleContactPhoto(id) {
    if (state.pool.indexOf(id) >= 0) return;
    var index = state.selected.indexOf(id);
    if (index >= 0) {
      state.selected.splice(index, 1);
    } else {
      if (state.pool.length + state.selected.length >= MAX_POOL_PHOTOS) {
        state.notice = "Pool 上限是 50 张；请先取消一张当前选择或从 Pool 删除照片。";
        render();
        return;
      }
      state.selected.push(id);
    }
    render();
  }

  function addSelectedToPool() {
    if (!state.selected.length) return;
    var capacity = Math.max(0, MAX_POOL_PHOTOS - state.pool.length);
    var additions = state.selected.slice(0, capacity);
    state.pool = uniqueIds(state.pool.concat(additions));
    state.selected = [];
    if (!additions.length) {
      state.notice = "Pool 已达到 50 张上限。";
      render();
      return;
    }
    state.stage = "sequence";
    state.notice =
      "已加入 " +
      additions.length +
      " 张；勾选 Pool 照片加入 Sequence，再次点击即可移除。";
    render();
  }

  function toggleSequencePhoto(id) {
    if (state.pool.indexOf(id) < 0) return;
    var poolElement = document.querySelector(".pool-column");
    var poolScrollTop = poolElement ? poolElement.scrollTop : 0;
    var sequenceElement = document.querySelector(".sequence-board");
    var sequenceScrollTop = sequenceElement ? sequenceElement.scrollTop : 0;
    var sequenceScrollLeft = sequenceElement ? sequenceElement.scrollLeft : 0;
    var index = state.sequence.indexOf(id);
    if (index >= 0) {
      state.sequence.splice(index, 1);
      state.selectedSequenceIds = state.selectedSequenceIds.filter(function (selectedId) {
        return selectedId !== id;
      });
      delete state.whiteboardItems[id];
      state.notice = photoById(id).title + " 已从 Sequence 移除。";
    } else {
      state.sequence.push(id);
      state.notice = photoById(id).title + " 已加入 Sequence。";
    }
    render();
    var nextPoolElement = document.querySelector(".pool-column");
    if (nextPoolElement) nextPoolElement.scrollTop = poolScrollTop;
    var nextSequenceElement = document.querySelector(".sequence-board");
    if (nextSequenceElement) {
      nextSequenceElement.scrollTop = sequenceScrollTop;
      nextSequenceElement.scrollLeft = sequenceScrollLeft;
    }
  }

  function selectAllPoolPhotos() {
    state.sequence = state.pool.slice();
    state.selectedSequenceIds = state.selectedSequenceIds.filter(function (id) {
      return state.sequence.indexOf(id) >= 0;
    });
    state.notice = "Pool 中的全部 " + state.sequence.length + " 张照片已加入 Sequence。";
    render();
  }

  function invertPoolPhotos() {
    var previous = state.sequence.slice();
    state.sequence = state.pool.filter(function (id) {
      return previous.indexOf(id) < 0;
    });
    state.selectedSequenceIds = state.selectedSequenceIds.filter(function (id) {
      return state.sequence.indexOf(id) >= 0;
    });
    ensureWhiteboardItems();
    state.notice = "已反选 Pool 与 Sequence 的对应关系。";
    render();
  }

  function toggleSequenceSelection(id) {
    if (state.sequence.indexOf(id) < 0) return;
    var index = state.selectedSequenceIds.indexOf(id);
    if (index >= 0) {
      state.selectedSequenceIds.splice(index, 1);
    } else {
      state.selectedSequenceIds.push(id);
    }
    render();
  }

  function selectAllSequencePhotos() {
    state.selectedSequenceIds = state.sequence.slice();
    render();
  }

  function invertSequenceSelection() {
    state.selectedSequenceIds = state.sequence.filter(function (id) {
      return state.selectedSequenceIds.indexOf(id) < 0;
    });
    render();
  }

  function removeSequencePhotos(ids, notice) {
    var removalIds = ids.filter(function (id) {
      return state.sequence.indexOf(id) >= 0;
    });
    if (!removalIds.length) return;
    var scrollSelector = state.whiteboard
      ? ".whiteboard-viewport"
      : ".sequence-board";
    var scrollElement = document.querySelector(scrollSelector);
    var scrollTop = scrollElement ? scrollElement.scrollTop : 0;
    var scrollLeft = scrollElement ? scrollElement.scrollLeft : 0;
    state.sequence = state.sequence.filter(function (id) {
      return removalIds.indexOf(id) < 0;
    });
    state.selectedSequenceIds = state.selectedSequenceIds.filter(function (id) {
      return removalIds.indexOf(id) < 0;
    });
    removalIds.forEach(function (id) {
      delete state.whiteboardItems[id];
    });
    state.notice = notice || "已从 Sequence 移除 " + removalIds.length + " 张照片。";
    render();
    var nextScrollElement = document.querySelector(scrollSelector);
    if (nextScrollElement) {
      nextScrollElement.scrollTop = scrollTop;
      nextScrollElement.scrollLeft = scrollLeft;
    }
  }

  function removePoolPhoto(id) {
    state.pool = state.pool.filter(function (photoId) {
      return photoId !== id;
    });
    state.sequence = state.sequence.filter(function (photoId) {
      return photoId !== id;
    });
    state.selected = state.selected.filter(function (photoId) {
      return photoId !== id;
    });
    state.selectedSequenceIds = state.selectedSequenceIds.filter(function (photoId) {
      return photoId !== id;
    });
    delete state.whiteboardItems[id];
    state.notice = photoById(id).title + " 已从 Pool 删除；Contact Sheet 已恢复彩色。";
    if (!state.pool.length) state.stage = "contact";
    render();
  }

  function saveVersion() {
    if (!state.sequence.length) return;
    var versionNumber = state.versions.length + 1;
    var version = {
      id: "v" + versionNumber,
      label:
        state.versionDraftName.trim() || "Version " + versionNumber,
      items: state.sequence.slice(),
      memo: ""
    };
    state.versions.push(version);
    state.workingFromVersionId = null;
    state.versionDraftName = "";

    if (!state.starredVersionId) {
      state.starredVersionId = version.id;
      state.notice =
        version.label +
        " 已保存并自动打星。现在调整 Sequence，再保存另一个版本。";
      render();
      return;
    }

    state.compareVersionId = version.id;
    state.stage = "compare";
    state.notice = version.label + " 正在与星标版本比较。";
    render();
  }

  function starVersion(id) {
    var version = versionById(id);
    if (!version) return;
    var previousStar = state.starredVersionId;
    if (previousStar && previousStar !== id) {
      state.compareVersionId = previousStar;
    }
    state.starredVersionId = id;
    state.notice = version.label + " 已成为新的比较基准。";
    render();
  }

  function selectCompareVersion(id) {
    var version = versionById(id);
    if (!version || id === state.starredVersionId) return;
    state.compareVersionId = id;
    state.stage = "compare";
    state.notice = version.label + " 正在与星标版本比较。";
    render();
  }

  function editVersion(id) {
    var version = versionById(id);
    if (!version) return;
    state.pool = uniqueIds(state.pool.concat(version.items));
    state.sequence = version.items.slice();
    state.workingFromVersionId = version.id;
    state.stage = "sequence";
    state.immersiveVersionId = null;
    state.notice =
      "正在编辑 " +
      version.label +
      " 的工作副本；下次保存会生成新版本。";
    render();
  }

  function reorderSequence(sourceId, targetId) {
    var sourceIndex = state.sequence.indexOf(sourceId);
    if (sourceIndex < 0) return;
    var targetIndex =
      targetId == null ? state.sequence.length - 1 : state.sequence.indexOf(targetId);
    if (targetIndex < 0 || sourceIndex === targetIndex) return;
    var next = state.sequence.slice();
    var moved = next.splice(sourceIndex, 1)[0];
    if (sourceIndex < targetIndex) targetIndex -= 1;
    next.splice(targetIndex, 0, moved);
    state.sequence = next;
    state.notice = photoById(sourceId).title + " 已移动到新位置。";
    render();
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function cloneWhiteboardItems(items) {
    var clone = {};
    Object.keys(items).forEach(function (id) {
      clone[id] = Object.assign({}, items[id]);
    });
    return clone;
  }

  function orderedWhiteboardIds() {
    var byY = state.sequence.slice().sort(function (leftId, rightId) {
      return state.whiteboardItems[leftId].y - state.whiteboardItems[rightId].y;
    });
    var rows = [];
    byY.forEach(function (id) {
      var item = state.whiteboardItems[id];
      var centerY = item.y + item.height / 2;
      var row = rows.find(function (candidate) {
        return Math.abs(candidate.centerY - centerY) <= 120;
      });
      if (!row) {
        row = { centerY: centerY, ids: [] };
        rows.push(row);
      }
      row.ids.push(id);
      row.centerY =
        row.ids.reduce(function (sum, rowId) {
          var rowItem = state.whiteboardItems[rowId];
          return sum + rowItem.y + rowItem.height / 2;
        }, 0) / row.ids.length;
    });
    return rows
      .sort(function (left, right) {
        return left.centerY - right.centerY;
      })
      .reduce(function (ordered, row) {
        return ordered.concat(
          row.ids.sort(function (leftId, rightId) {
            return (
              state.whiteboardItems[leftId].x -
              state.whiteboardItems[rightId].x
            );
          })
        );
      }, []);
  }

  function commitWhiteboardOrder() {
    if (!state.sequence.length) return;
    state.sequence = orderedWhiteboardIds();
    state.notice = "白板排序已按从上到下、同一行从左到右写回 Sequence。";
  }

  function openPhotoPreview(id, contextIds, source) {
    var ids = (contextIds || state.sequence).filter(function (photoId) {
      return Boolean(photoById(photoId));
    });
    if (ids.indexOf(id) < 0) return;
    state.previewContextIds = ids.slice();
    state.previewPhotoId = id;
    state.previewSource = source || "sequence";
    render();
  }

  function closePhotoPreview() {
    state.previewPhotoId = null;
    state.previewContextIds = [];
    state.previewSource = null;
    render();
  }

  function selectPreviewPhoto() {
    var id = state.previewPhotoId;
    if (!id || state.previewSource === "compare") return;
    if (state.previewSource === "contact") {
      if (state.selected.indexOf(id) < 0) toggleContactPhoto(id);
      return;
    }
    if (state.sequence.indexOf(id) < 0) toggleSequencePhoto(id);
  }

  function removePreviewPhoto() {
    var id = state.previewPhotoId;
    if (!id || state.previewSource === "compare") return;
    if (state.previewSource === "contact") {
      if (state.selected.indexOf(id) >= 0) toggleContactPhoto(id);
      return;
    }
    if (state.sequence.indexOf(id) >= 0) toggleSequencePhoto(id);
  }

  function stepPhotoPreview(direction) {
    var ids = state.previewContextIds.length
      ? state.previewContextIds
      : state.sequence;
    var index = ids.indexOf(state.previewPhotoId);
    if (index < 0) return;
    var nextIndex = index + Number(direction);
    if (nextIndex < 0 || nextIndex >= ids.length) return;
    state.previewPhotoId = ids[nextIndex];
    render();
  }

  function toggleWhiteboard() {
    if (!state.sequence.length) return;
    if (state.whiteboard) {
      exitWhiteboard(true);
      return;
    }
    ensureWhiteboardItems();
    state.whiteboardEntrySequence = state.sequence.slice();
    state.whiteboardEntryItems = cloneWhiteboardItems(state.whiteboardItems);
    state.whiteboard = true;
    state.previewPhotoId = null;
    state.previewContextIds = [];
    state.previewSource = null;
    state.sequencePanorama = false;
    state.immersiveVersionId = null;
    render();
  }

  function exitWhiteboard(saveChanges) {
    if (!state.whiteboard) return;
    if (saveChanges) {
      commitWhiteboardOrder();
    } else {
      state.sequence = state.whiteboardEntrySequence.slice();
      state.whiteboardItems = cloneWhiteboardItems(state.whiteboardEntryItems);
      state.selectedSequenceIds = state.selectedSequenceIds.filter(function (id) {
        return state.sequence.indexOf(id) >= 0;
      });
      state.notice = "已放弃本次白板中的排序、移动、缩放和移除改动。";
    }
    state.whiteboard = false;
    state.whiteboardEntrySequence = [];
    state.whiteboardEntryItems = {};
    render();
  }

  function openSequencePanorama() {
    if (!state.sequence.length) return;
    state.sequencePanorama = true;
    state.previewPhotoId = null;
    state.previewContextIds = [];
    state.previewSource = null;
    render();
  }

  function openVersionPreview(id) {
    var version = versionById(id);
    if (!version || !version.items.length) return;
    state.immersiveVersionId = id;
    state.previewPhotoId = null;
    state.previewContextIds = [];
    state.previewSource = null;
    render();
  }

  function currentPanoramaIds() {
    if (state.sequencePanorama) return state.sequence.slice();
    var version = versionById(state.immersiveVersionId);
    return version ? version.items.slice() : [];
  }

  function resetPrototype() {
    state = createInitialState(true);
    state.notice = importedLibraryName
      ? "工作状态已清空；本地 JPEG 图库仍保留，可重新开始筛选。"
      : "工作状态已清空，请重新建立候选池。";
    render();
  }

  function changeWhiteboardZoom(nextZoom, resetView) {
    var viewport = document.querySelector(".whiteboard-viewport");
    var oldZoom = state.whiteboardZoom;
    var rect =
      viewport && viewport.getBoundingClientRect
        ? viewport.getBoundingClientRect()
        : { width: 1200, height: 700 };
    var viewportWidth = viewport && viewport.clientWidth
      ? viewport.clientWidth
      : rect.width;
    var viewportHeight = viewport && viewport.clientHeight
      ? viewport.clientHeight
      : rect.height;
    var centerX = viewport
      ? (viewport.scrollLeft + viewportWidth / 2) / oldZoom
      : 0;
    var centerY = viewport
      ? (viewport.scrollTop + viewportHeight / 2) / oldZoom
      : 0;

    state.whiteboardZoom = clamp(nextZoom, 0.25, 1.5);
    render();

    var nextViewport = document.querySelector(".whiteboard-viewport");
    if (!nextViewport) return;
    if (resetView) {
      nextViewport.scrollLeft = 0;
      nextViewport.scrollTop = 0;
      return;
    }
    nextViewport.scrollLeft = Math.max(
      0,
      centerX * state.whiteboardZoom - viewportWidth / 2
    );
    nextViewport.scrollTop = Math.max(
      0,
      centerY * state.whiteboardZoom - viewportHeight / 2
    );
  }

  document.addEventListener("click", function (event) {
    var target = event.target.closest("[data-action]");
    if (!target) return;
    var action = target.getAttribute("data-action");
    var id = target.getAttribute("data-id");

    if (action === "toggle-contact-photo") {
      toggleContactPhoto(id);
      return;
    }
    if (action === "add-to-pool") {
      addSelectedToPool();
      return;
    }
    if (action === "select-contact-page") {
      bulkSelectContactPage(false);
      return;
    }
    if (action === "invert-contact-page") {
      bulkSelectContactPage(true);
      return;
    }
    if (action === "change-contact-page") {
      changeContactPage(target.getAttribute("data-direction"));
      return;
    }
    if (action === "toggle-sequence-photo") {
      toggleSequencePhoto(id);
      return;
    }
    if (action === "select-all-pool") {
      selectAllPoolPhotos();
      return;
    }
    if (action === "invert-pool-selection") {
      invertPoolPhotos();
      return;
    }
    if (action === "toggle-sequence-selection") {
      toggleSequenceSelection(id);
      return;
    }
    if (action === "select-all-sequence") {
      selectAllSequencePhotos();
      return;
    }
    if (action === "invert-sequence-selection") {
      invertSequenceSelection();
      return;
    }
    if (action === "remove-selected-sequence") {
      removeSequencePhotos(state.selectedSequenceIds.slice());
      return;
    }
    if (action === "remove-pool-photo") {
      removePoolPhoto(id);
      return;
    }
    if (action === "save-version") {
      saveVersion();
      return;
    }
    if (action === "star-version") {
      starVersion(id);
      return;
    }
    if (action === "select-compare-version") {
      selectCompareVersion(id);
      return;
    }
    if (action === "edit-version") {
      editVersion(id);
      return;
    }
    if (action === "open-version-preview") {
      openVersionPreview(id);
      return;
    }
    if (action === "close-version-preview") {
      state.immersiveVersionId = null;
      render();
      return;
    }
    if (action === "open-sequence-panorama") {
      openSequencePanorama();
      return;
    }
    if (action === "close-sequence-panorama") {
      state.sequencePanorama = false;
      render();
      return;
    }
    if (action === "open-panorama-photo") {
      openPhotoPreview(
        id,
        currentPanoramaIds(),
        state.immersiveVersionId ? "compare" : "sequence"
      );
      return;
    }
    if (action === "toggle-whiteboard") {
      toggleWhiteboard();
      return;
    }
    if (action === "zoom-whiteboard") {
      changeWhiteboardZoom(
        state.whiteboardZoom +
          Number(target.getAttribute("data-direction")) * 0.25,
        false
      );
      return;
    }
    if (action === "reset-whiteboard-view") {
      changeWhiteboardZoom(0.75, true);
      return;
    }
    if (action === "exit-whiteboard-save") {
      exitWhiteboard(true);
      return;
    }
    if (action === "exit-whiteboard-discard") {
      exitWhiteboard(false);
      return;
    }
    if (action === "remove-whiteboard-photo") {
      removeSequencePhotos([id], photoById(id).title + " 已从白板和 Sequence 移除。");
      return;
    }
    if (action === "remove-whiteboard-selection") {
      removeSequencePhotos(
        state.selectedSequenceIds.slice(),
        "已从白板和 Sequence 移除选中的照片。"
      );
      return;
    }
    if (action === "open-photo-preview") {
      if (suppressPhotoClick) {
        suppressPhotoClick = false;
        return;
      }
      openPhotoPreview(id, state.sequence, "sequence");
      return;
    }
    if (action === "open-context-photo-preview") {
      var previewContext = target.getAttribute("data-context");
      openPhotoPreview(id, previewContextIds(previewContext), previewContext);
      return;
    }
    if (action === "preview-select-photo") {
      selectPreviewPhoto();
      return;
    }
    if (action === "preview-remove-photo") {
      removePreviewPhoto();
      return;
    }
    if (action === "close-photo-preview") {
      closePhotoPreview();
      return;
    }
    if (action === "step-photo-preview") {
      stepPhotoPreview(target.getAttribute("data-direction"));
      return;
    }
    if (action === "set-sequence-view") {
      var nextView = target.getAttribute("data-view");
      if (nextView === "horizontal" || nextView === "grid") {
        state.sequenceView = nextView;
        render();
      }
      return;
    }
    if (action === "scroll-sequence") {
      var board = document.querySelector(".sequence-board.view-horizontal");
      if (board) {
        board.scrollBy({
          left: Number(target.getAttribute("data-direction")) * 360,
          behavior: "smooth"
        });
      }
      return;
    }
    if (action === "goto-stage") {
      gotoStage(target.getAttribute("data-stage"));
      return;
    }
    if (action === "reset") {
      resetPrototype();
    }
  });

  document.addEventListener("change", function (event) {
    var target = event.target;
    if (!target || target.getAttribute("data-role") !== "local-jpeg-folder") {
      return;
    }
    importLocalJpegs(target.files);
    target.value = "";
  });

  document.addEventListener("input", function (event) {
    var target = event.target;
    if (!target) return;
    if (target.getAttribute("data-role") === "version-name") {
      state.versionDraftName = target.value;
      return;
    }
    if (target.getAttribute("data-role") !== "version-memo") return;
    var version = versionById(target.getAttribute("data-version-id"));
    if (version) version.memo = target.value;
  });

  document.addEventListener("keydown", function (event) {
    var target = event.target;
    var tagName = target && target.tagName ? target.tagName.toLowerCase() : "";
    if (
      tagName === "input" ||
      tagName === "textarea" ||
      (target && target.isContentEditable)
    ) {
      return;
    }
    if (state.previewPhotoId) {
      if (event.key === "Escape") {
        state.previewPhotoId = null;
        state.previewContextIds = [];
        state.previewSource = null;
        render();
        return;
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        if (event.preventDefault) event.preventDefault();
        stepPhotoPreview(event.key === "ArrowLeft" ? -1 : 1);
      }
      return;
    }
    if (event.key === "Escape" && state.immersiveVersionId) {
      state.immersiveVersionId = null;
      render();
      return;
    }
    if (event.key === "Escape" && state.sequencePanorama) {
      state.sequencePanorama = false;
      render();
    }
  });

  function syncWhiteboardSelectionDom() {
    if (!document.querySelectorAll) return;
    Array.prototype.forEach.call(
      document.querySelectorAll("[data-whiteboard-item]"),
      function (element) {
        var selected =
          state.selectedSequenceIds.indexOf(
            element.getAttribute("data-whiteboard-item")
          ) >= 0;
        if (element.classList && element.classList.toggle) {
          element.classList.toggle("is-selected", selected);
        }
      }
    );
  }

  document.addEventListener("pointerdown", function (event) {
    var whiteboardViewportTarget = event.target.closest(".whiteboard-viewport");
    if (
      state.whiteboard &&
      event.button === 2 &&
      whiteboardViewportTarget
    ) {
      if (event.preventDefault) event.preventDefault();
      pointerInteraction = {
        kind: "whiteboard-pan",
        startX: event.clientX,
        startY: event.clientY,
        startScrollLeft: whiteboardViewportTarget.scrollLeft,
        startScrollTop: whiteboardViewportTarget.scrollTop,
        viewport: whiteboardViewportTarget,
        moved: false,
        pointerId: event.pointerId
      };
      if (whiteboardViewportTarget.classList) {
        whiteboardViewportTarget.classList.add("is-panning");
      }
      if (event.target.setPointerCapture && event.pointerId != null) {
        event.target.setPointerCapture(event.pointerId);
      }
      return;
    }
    var resizeTarget = event.target.closest("[data-resize-kind]");
    var moduleDragTarget = event.target.closest("[data-module-drag-handle]");
    var whiteboardDragTarget = event.target.closest(
      "[data-whiteboard-drag-handle]"
    );
    var whiteboardCanvasTarget = event.target.closest(".whiteboard-canvas");
    if (
      state.whiteboard &&
      (event.button == null || event.button === 0) &&
      whiteboardCanvasTarget &&
      !resizeTarget &&
      !whiteboardDragTarget
    ) {
      if (event.preventDefault) event.preventDefault();
      var canvasRect = whiteboardCanvasTarget.getBoundingClientRect();
      var viewportForSelection = document.querySelector(".whiteboard-viewport");
      pointerInteraction = {
        kind: "whiteboard-marquee",
        startX: event.clientX,
        startY: event.clientY,
        startBoardX: (event.clientX - canvasRect.left) / state.whiteboardZoom,
        startBoardY: (event.clientY - canvasRect.top) / state.whiteboardZoom,
        canvasRect: canvasRect,
        zoom: state.whiteboardZoom,
        scrollTop: viewportForSelection ? viewportForSelection.scrollTop : 0,
        scrollLeft: viewportForSelection ? viewportForSelection.scrollLeft : 0,
        moved: false,
        pointerId: event.pointerId
      };
      state.selectedSequenceIds = [];
      syncWhiteboardSelectionDom();
      var selectionBox = document.querySelector(".whiteboard-selection-box");
      if (selectionBox && selectionBox.style) {
        selectionBox.style.display = "block";
        selectionBox.style.left = pointerInteraction.startBoardX + "px";
        selectionBox.style.top = pointerInteraction.startBoardY + "px";
        selectionBox.style.width = "0px";
        selectionBox.style.height = "0px";
      }
      if (event.target.setPointerCapture && event.pointerId != null) {
        event.target.setPointerCapture(event.pointerId);
      }
      return;
    }
    if (!resizeTarget && !moduleDragTarget && !whiteboardDragTarget) return;
    if (event.preventDefault) event.preventDefault();

    var interaction = {
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      pointerId: event.pointerId
    };

    if (resizeTarget) {
      interaction.kind = resizeTarget.getAttribute("data-resize-kind");
      interaction.id = resizeTarget.getAttribute("data-id");
      interaction.corner = resizeTarget.getAttribute("data-corner");
    } else if (moduleDragTarget) {
      interaction.kind = "module-move";
      interaction.id = moduleDragTarget.getAttribute("data-module-drag-handle");
    } else {
      interaction.kind = "whiteboard-move";
      interaction.id = whiteboardDragTarget.getAttribute(
        "data-whiteboard-drag-handle"
      );
    }

    if (interaction.kind === "module" || interaction.kind === "module-move") {
      interaction.start = Object.assign({}, state.moduleLayout[interaction.id]);
      var editor = document.querySelector(".editor-layout");
      var editorRect =
        editor && editor.getBoundingClientRect
          ? editor.getBoundingClientRect()
          : { width: 1200 };
      interaction.editorWidth = editorRect.width || 1200;
    } else if (
      interaction.kind === "whiteboard-photo" ||
      interaction.kind === "whiteboard-move"
    ) {
      if (
        interaction.kind === "whiteboard-move" &&
        state.selectedSequenceIds.indexOf(interaction.id) < 0
      ) {
        state.selectedSequenceIds = [interaction.id];
        syncWhiteboardSelectionDom();
      }
      interaction.ids = interaction.kind === "whiteboard-move"
        ? state.selectedSequenceIds.slice()
        : [interaction.id];
      interaction.starts = {};
      interaction.ids.forEach(function (id) {
        interaction.starts[id] = Object.assign({}, state.whiteboardItems[id]);
      });
      interaction.start = interaction.starts[interaction.id];
      var viewport = document.querySelector(".whiteboard-viewport");
      interaction.scrollTop = viewport ? viewport.scrollTop : 0;
      interaction.scrollLeft = viewport ? viewport.scrollLeft : 0;
      interaction.zoom = state.whiteboardZoom;
    } else if (interaction.kind === "sequence-photo") {
      interaction.startSize = sequencePhotoSize(interaction.id);
      var sequenceBoard = document.querySelector(".sequence-board");
      interaction.scrollTop = sequenceBoard ? sequenceBoard.scrollTop : 0;
      interaction.scrollLeft = sequenceBoard ? sequenceBoard.scrollLeft : 0;
    }

    pointerInteraction = interaction;
    if (event.target.setPointerCapture && event.pointerId != null) {
      event.target.setPointerCapture(event.pointerId);
    }
  });

  document.addEventListener("pointermove", function (event) {
    if (!pointerInteraction) return;
    var dx = event.clientX - pointerInteraction.startX;
    var dy = event.clientY - pointerInteraction.startY;
    if (Math.abs(dx) + Math.abs(dy) > 2) pointerInteraction.moved = true;
    if (event.preventDefault) event.preventDefault();

    if (pointerInteraction.kind === "whiteboard-pan") {
      pointerInteraction.viewport.scrollLeft =
        pointerInteraction.startScrollLeft - dx;
      pointerInteraction.viewport.scrollTop =
        pointerInteraction.startScrollTop - dy;
      return;
    }

    if (pointerInteraction.kind === "whiteboard-marquee") {
      var currentBoardX =
        (event.clientX - pointerInteraction.canvasRect.left) /
        pointerInteraction.zoom;
      var currentBoardY =
        (event.clientY - pointerInteraction.canvasRect.top) /
        pointerInteraction.zoom;
      var selectionLeft = Math.min(pointerInteraction.startBoardX, currentBoardX);
      var selectionTop = Math.min(pointerInteraction.startBoardY, currentBoardY);
      var selectionRight = Math.max(pointerInteraction.startBoardX, currentBoardX);
      var selectionBottom = Math.max(pointerInteraction.startBoardY, currentBoardY);
      state.selectedSequenceIds = state.sequence.filter(function (id) {
        var item = state.whiteboardItems[id];
        return (
          item.x < selectionRight &&
          item.x + item.width > selectionLeft &&
          item.y < selectionBottom &&
          item.y + item.height > selectionTop
        );
      });
      var activeSelectionBox = document.querySelector(".whiteboard-selection-box");
      if (activeSelectionBox && activeSelectionBox.style) {
        activeSelectionBox.style.left = selectionLeft + "px";
        activeSelectionBox.style.top = selectionTop + "px";
        activeSelectionBox.style.width = selectionRight - selectionLeft + "px";
        activeSelectionBox.style.height = selectionBottom - selectionTop + "px";
      }
      syncWhiteboardSelectionDom();
      return;
    }

    if (
      pointerInteraction.kind === "module" ||
      pointerInteraction.kind === "module-move"
    ) {
      var moduleLayout = state.moduleLayout[pointerInteraction.id];
      var moduleStart = pointerInteraction.start;
      var dxPercent = (dx / pointerInteraction.editorWidth) * 100;
      if (pointerInteraction.kind === "module-move") {
        moduleLayout.x = clamp(
          moduleStart.x + dxPercent,
          0,
          Math.max(0, 100 - moduleStart.width)
        );
        moduleLayout.y = clamp(moduleStart.y + dy, 0, 1200);
      } else {
        var moduleCorner = pointerInteraction.corner;
        if (moduleCorner.indexOf("e") >= 0) {
          moduleLayout.width = clamp(
            moduleStart.width + dxPercent,
            20,
            100 - moduleStart.x
          );
        }
        if (moduleCorner.indexOf("w") >= 0) {
          var nextModuleX = clamp(
            moduleStart.x + dxPercent,
            0,
            moduleStart.x + moduleStart.width - 20
          );
          moduleLayout.width = moduleStart.width + moduleStart.x - nextModuleX;
          moduleLayout.x = nextModuleX;
        }
        if (moduleCorner.indexOf("s") >= 0) {
          moduleLayout.height = clamp(moduleStart.height + dy, 320, 1200);
        }
        if (moduleCorner.indexOf("n") >= 0) {
          var nextModuleY = clamp(
            moduleStart.y + dy,
            0,
            moduleStart.y + moduleStart.height - 320
          );
          moduleLayout.height =
            moduleStart.height + moduleStart.y - nextModuleY;
          moduleLayout.y = nextModuleY;
        }
      }
      var moduleElement = document.querySelector(
        '[data-module="' + pointerInteraction.id + '"]'
      );
      if (moduleElement && moduleElement.style) {
        moduleElement.style.setProperty("--module-x", moduleLayout.x + "%");
        moduleElement.style.setProperty("--module-y", moduleLayout.y + "px");
        moduleElement.style.setProperty(
          "--module-width",
          moduleLayout.width + "%"
        );
        moduleElement.style.setProperty(
          "--module-height",
          moduleLayout.height + "px"
        );
      }
      var editorElement = document.querySelector(".editor-layout");
      if (editorElement && editorElement.style) {
        editorElement.style.setProperty(
          "--editor-canvas-height",
          editorCanvasHeight() + "px"
        );
      }
      return;
    }

    if (pointerInteraction.kind === "sequence-photo") {
      var horizontalDelta =
        pointerInteraction.corner.indexOf("e") >= 0 ? dx : -dx;
      var verticalDelta =
        pointerInteraction.corner.indexOf("s") >= 0 ? dy : -dy;
      var nextPhotoSize = clamp(
        pointerInteraction.startSize +
          (horizontalDelta + verticalDelta) / 2,
        120,
        420
      );
      state.sequencePhotoSizes[pointerInteraction.id] = Math.round(nextPhotoSize);
      var sequenceCard = document.querySelector(
        '[data-drag-id="' + pointerInteraction.id + '"]'
      );
      if (sequenceCard && sequenceCard.style) {
        sequenceCard.style.setProperty(
          "--sequence-photo-size",
          Math.round(nextPhotoSize) + "px"
        );
      }
      return;
    }

    var whiteboardDx = dx / (pointerInteraction.zoom || 1);
    var whiteboardDy = dy / (pointerInteraction.zoom || 1);
    if (pointerInteraction.kind === "whiteboard-move") {
      pointerInteraction.ids.forEach(function (id) {
        var start = pointerInteraction.starts[id];
        var itemState = state.whiteboardItems[id];
        itemState.x = clamp(start.x + whiteboardDx, 20, 5000);
        itemState.y = clamp(start.y + whiteboardDy, 80, 3400);
        var itemElement = document.querySelector(
          '[data-whiteboard-item="' + id + '"]'
        );
        if (itemElement && itemElement.style) {
          itemElement.style.left = itemState.x + "px";
          itemElement.style.top = itemState.y + "px";
        }
      });
      return;
    }

    var whiteboardItemState = state.whiteboardItems[pointerInteraction.id];
    var whiteboardStart = pointerInteraction.start;
    var photoCorner = pointerInteraction.corner;
    if (photoCorner.indexOf("e") >= 0) {
      whiteboardItemState.width = clamp(
        whiteboardStart.width + whiteboardDx,
        120,
        720
      );
    }
    if (photoCorner.indexOf("w") >= 0) {
      var nextPhotoX = clamp(
        whiteboardStart.x + whiteboardDx,
        20,
        whiteboardStart.x + whiteboardStart.width - 120
      );
      whiteboardItemState.width =
        whiteboardStart.width + whiteboardStart.x - nextPhotoX;
      whiteboardItemState.x = nextPhotoX;
    }
    if (photoCorner.indexOf("s") >= 0) {
      whiteboardItemState.height = clamp(
        whiteboardStart.height + whiteboardDy,
        140,
        900
      );
    }
    if (photoCorner.indexOf("n") >= 0) {
      var nextPhotoY = clamp(
        whiteboardStart.y + whiteboardDy,
        80,
        whiteboardStart.y + whiteboardStart.height - 140
      );
      whiteboardItemState.height =
        whiteboardStart.height + whiteboardStart.y - nextPhotoY;
      whiteboardItemState.y = nextPhotoY;
    }
    var whiteboardElement = document.querySelector(
      '[data-whiteboard-item="' + pointerInteraction.id + '"]'
    );
    if (whiteboardElement && whiteboardElement.style) {
      whiteboardElement.style.left = whiteboardItemState.x + "px";
      whiteboardElement.style.top = whiteboardItemState.y + "px";
      whiteboardElement.style.width = whiteboardItemState.width + "px";
      whiteboardElement.style.height = whiteboardItemState.height + "px";
    }
  });

  function finishPointerInteraction() {
    if (!pointerInteraction) return;
    var finished = pointerInteraction;
    pointerInteraction = null;
    if (finished.kind === "whiteboard-pan") {
      if (finished.viewport && finished.viewport.classList) {
        finished.viewport.classList.remove("is-panning");
      }
      return;
    }
    if (finished.kind === "whiteboard-marquee") {
      render();
      var marqueeViewport = document.querySelector(".whiteboard-viewport");
      if (marqueeViewport) {
        marqueeViewport.scrollTop = finished.scrollTop || 0;
        marqueeViewport.scrollLeft = finished.scrollLeft || 0;
      }
      return;
    }
    if (!finished.moved) return;

    if (finished.kind === "whiteboard-move") {
      commitWhiteboardOrder();
      suppressPhotoClick = true;
      setTimeout(function () {
        suppressPhotoClick = false;
      }, 0);
    }
    render();

    var scrollSelector =
      finished.kind === "whiteboard-move" ||
      finished.kind === "whiteboard-photo"
        ? ".whiteboard-viewport"
        : finished.kind === "sequence-photo"
          ? ".sequence-board"
          : null;
    if (scrollSelector) {
      var scrollElement = document.querySelector(scrollSelector);
      if (scrollElement) {
        scrollElement.scrollTop = finished.scrollTop || 0;
        scrollElement.scrollLeft = finished.scrollLeft || 0;
      }
    }
  }

  document.addEventListener("pointerup", finishPointerInteraction);
  document.addEventListener("pointercancel", finishPointerInteraction);

  document.addEventListener("contextmenu", function (event) {
    if (state.whiteboard && event.target.closest(".whiteboard-viewport")) {
      event.preventDefault();
    }
  });

  document.addEventListener("dragstart", function (event) {
    if (event.target.closest("[data-resize-kind]")) {
      if (event.preventDefault) event.preventDefault();
      return;
    }
    var target = event.target.closest("[data-drag-id]");
    if (!target) return;
    draggedPhotoId = target.getAttribute("data-drag-id");
    target.classList.add("is-dragging");
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", draggedPhotoId);
    }
  });

  document.addEventListener("dragover", function (event) {
    if (!event.target.closest("[data-sequence-dropzone]")) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  });

  document.addEventListener("drop", function (event) {
    var zone = event.target.closest("[data-sequence-dropzone]");
    if (!zone) return;
    event.preventDefault();
    var sourceId =
      draggedPhotoId ||
      (event.dataTransfer ? event.dataTransfer.getData("text/plain") : null);
    var target = event.target.closest("[data-drop-id]");
    reorderSequence(sourceId, target ? target.getAttribute("data-drop-id") : null);
    draggedPhotoId = null;
  });

  document.addEventListener("dragend", function (event) {
    var target = event.target.closest("[data-drag-id]");
    if (target) target.classList.remove("is-dragging");
    draggedPhotoId = null;
  });

  render();
})();
