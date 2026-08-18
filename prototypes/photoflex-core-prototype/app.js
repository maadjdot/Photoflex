(function () {
  "use strict";

  var photos = [
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

  function defaultModuleLayout() {
    return {
      sequence: { x: 0, y: 0, width: 75, height: 600 },
      pool: { x: 76, y: 0, width: 24, height: 600 }
    };
  }

  function createInitialState() {
    var initial = {
      stage: "contact",
      selected: [],
      pool: [],
      sequence: [],
      versions: [],
      starredVersionId: null,
      compareVersionId: null,
      workingFromVersionId: null,
      sequenceView: "horizontal",
      sequenceFrameHeight: 350,
      sequencePhotoSizes: {},
      layoutEditing: false,
      moduleLayout: defaultModuleLayout(),
      immersive: false,
      previewPhotoId: null,
      versionDraftName: "",
      notice: "先凭直觉选择照片，再把它们加入 Pool。"
    };
    if (typeof window === "undefined") return initial;

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
    }
    if (query.get("view") === "grid") {
      initial.sequenceView = "grid";
    }
    if (query.get("layout") === "1" && initial.stage === "sequence") {
      initial.layoutEditing = true;
    }
    if (query.get("immersive") === "1" && initial.stage === "sequence") {
      initial.immersive = true;
    }
    if (
      query.get("preview") &&
      initial.sequence.indexOf(query.get("preview")) >= 0
    ) {
      initial.previewPhotoId = query.get("preview");
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
      '<span class="photo-thumb" style="--tone-a:' +
      photo.a +
      ";--tone-b:" +
      photo.b +
      '"></span>'
    );
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

  function contactPhotoCard(photo) {
    var selected = state.selected.indexOf(photo.id) >= 0;
    var inPool = state.pool.indexOf(photo.id) >= 0;
    var classes = "contact-photo";
    if (selected) classes += " is-selected";
    if (inPool) classes += " is-in-pool";

    return (
      '<button class="' +
      classes +
      '" type="button" data-photo-id="' +
      photo.id +
      '"' +
      (inPool
        ? " disabled"
        : ' data-action="toggle-contact-photo" data-id="' + photo.id + '"') +
      ' aria-pressed="' +
      selected +
      '">' +
      '<span class="selection-mark">✓</span>' +
      '<span class="pool-mark">已在 Pool</span>' +
      photoThumb(photo) +
      '<span class="photo-name">' +
      escapeHtml(photo.title) +
      '</span><span class="photo-meta">' +
      escapeHtml(photo.meta) +
      " · " +
      photo.id +
      "</span></button>"
    );
  }

  function contactContent() {
    var buttonLabel = state.pool.length
      ? "再加入 Pool（" + state.selected.length + "）"
      : "加入 Pool（" + state.selected.length + "）";
    return (
      '<section class="contact-stage">' +
      '<div class="contact-summary"><span>本次选择 ' +
      state.selected.length +
      " 张</span><span>Pool 已有 " +
      state.pool.length +
      " 张</span></div>" +
      '<div class="contact-grid">' +
      photos.map(contactPhotoCard).join("") +
      '</div><div class="stage-actions"><button class="btn btn-primary" type="button" data-action="add-to-pool"' +
      (state.selected.length ? "" : " disabled") +
      ">" +
      buttonLabel +
      '</button><span class="action-hint">加入后会自动进入 Sequence + Pool。</span></div></section>'
    );
  }

  function sequenceItem(id, index) {
    var photo = photoById(id);
    return (
      '<article class="sequence-card" draggable="true" data-drag-id="' +
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
      '</small></span><span class="photo-size-controls" aria-label="' +
      escapeHtml(photo.title) +
      ' 显示大小"><button type="button" data-action="resize-sequence-photo" data-id="' +
      id +
      '" data-delta="-30" aria-label="缩小照片">−</button><small>' +
      sequencePhotoSize(id) +
      ' px</small><button type="button" data-action="resize-sequence-photo" data-id="' +
      id +
      '" data-delta="30" aria-label="放大照片">＋</button></span><button class="remove-from-sequence" type="button" data-action="toggle-sequence-photo" data-id="' +
      id +
      '" aria-label="从 Sequence 移除 ' +
      escapeHtml(photo.title) +
      '">×</button></div></article>'
    );
  }

  function layoutRange(moduleName, property, label, min, max, step, suffix) {
    var value =
      moduleName === "sequence" && property === "frameHeight"
        ? state.sequenceFrameHeight
        : state.moduleLayout[moduleName][property];
    var outputKey = moduleName + "-" + property;
    return (
      '<label class="layout-range"><span>' +
      escapeHtml(label) +
      '<output data-layout-output="' +
      outputKey +
      '">' +
      value +
      escapeHtml(suffix) +
      '</output></span><input type="range" min="' +
      min +
      '" max="' +
      max +
      '" step="' +
      step +
      '" value="' +
      value +
      '" data-role="layout-range" data-module="' +
      moduleName +
      '" data-property="' +
      property +
      '" data-suffix="' +
      escapeHtml(suffix) +
      '"></label>'
    );
  }

  function layoutEditor() {
    if (!state.layoutEditing) return "";
    return (
      '<section class="layout-editor" aria-label="模块布局设置">' +
      '<fieldset><legend>Sequence 模块</legend>' +
      layoutRange("sequence", "x", "X 位置", 0, 80, 1, "%") +
      layoutRange("sequence", "y", "Y 位置", 0, 480, 10, " px") +
      layoutRange("sequence", "width", "模块宽度", 20, 100, 1, "%") +
      layoutRange("sequence", "height", "模块高度", 380, 1000, 10, " px") +
      layoutRange("sequence", "frameHeight", "横向画布高度", 280, 720, 10, " px") +
      '</fieldset><fieldset><legend>Pool 模块</legend>' +
      layoutRange("pool", "x", "X 位置", 0, 80, 1, "%") +
      layoutRange("pool", "y", "Y 位置", 0, 480, 10, " px") +
      layoutRange("pool", "width", "模块宽度", 20, 100, 1, "%") +
      layoutRange("pool", "height", "模块高度", 320, 1200, 10, " px") +
      '</fieldset><div class="layout-editor-note"><span>模块可以重叠；Pool 内容超出模块高度时会独立滚动。</span><button class="text-button" type="button" data-action="reset-layout">恢复默认布局</button></div></section>'
    );
  }

  function sequenceWorkspaceToolbar() {
    return (
      '<div class="workspace-toolbar"><div><strong>工作区布局</strong><span>模块位置、模块大小和照片大小互相独立。</span></div><div class="workspace-toolbar-actions"><button class="btn btn-secondary' +
      (state.layoutEditing ? " is-active" : "") +
      '" type="button" data-action="toggle-layout-editing">' +
      (state.layoutEditing ? "完成布局调整" : "调整模块") +
      '</button><button class="btn btn-primary" type="button" data-action="toggle-immersive"' +
      (state.sequence.length ? "" : " disabled") +
      ">进入沉浸模式</button></div></div>" +
      layoutEditor()
    );
  }

  function poolPhotoCard(id) {
    var photo = photoById(id);
    var inSequence = state.sequence.indexOf(id) >= 0;
    return (
      '<article class="pool-card' +
      (inSequence ? " is-in-sequence" : "") +
      '"><button class="pool-toggle" type="button" data-action="toggle-sequence-photo" data-id="' +
      id +
      '" aria-pressed="' +
      inSequence +
      '"><span class="pool-checkbox">' +
      (inSequence ? "✓" : "") +
      "</span>" +
      photoThumb(photo) +
      '<span class="photo-name">' +
      escapeHtml(photo.title) +
      '</span></button><button class="pool-remove" type="button" data-action="remove-pool-photo" data-id="' +
      id +
      '" aria-label="从 Pool 删除 ' +
      escapeHtml(photo.title) +
      '">从 Pool 删除</button></article>'
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
      sequenceWorkspaceToolbar() +
      '<section class="editor-layout" style="--editor-canvas-height:' +
      editorCanvasHeight() +
      'px">' +
      '<div class="sequence-column" data-module="sequence" style="' +
      moduleStyle("sequence") +
      '"><header class="column-heading"><div><p class="eyebrow">序列模块 · 照片可独立缩放</p><h2>Sequence <span>' +
      state.sequence.length +
      '</span></h2></div>' +
      '<div class="sequence-tools">' +
      origin +
      '<div class="view-toggle" role="group" aria-label="Sequence 视角"><button class="' +
      (state.sequenceView === "horizontal" ? "is-active" : "") +
      '" type="button" data-action="set-sequence-view" data-view="horizontal">横向</button><button class="' +
      (state.sequenceView === "grid" ? "is-active" : "") +
      '" type="button" data-action="set-sequence-view" data-view="grid">网格</button></div></div>' +
      '</header><div class="sequence-viewport"><div class="sequence-board view-' +
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
      '"><header class="column-heading"><div><p class="eyebrow">候选池 · 内容独立滚动</p><h2>Pool <span>' +
      state.pool.length +
      '</span></h2></div><button class="text-button" type="button" data-action="goto-stage" data-stage="contact">添加照片</button></header>' +
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
      '</button></header><button class="version-open" type="button" data-action="edit-version" data-id="' +
      version.id +
      '" aria-label="打开 ' +
      escapeHtml(version.label) +
      ' 继续排序">' +
      versionPreview(version) +
      '<span class="open-version-hint">打开这个版本，返回 Sequence 继续排序 →</span></button></section>' +
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

  function immersiveSequenceItem(id, index) {
    var photo = photoById(id);
    return (
      '<button class="immersive-photo" type="button" data-action="open-photo-preview" data-id="' +
      id +
      '" style="--sequence-photo-size:' +
      sequencePhotoSize(id) +
      'px" aria-label="大图预览 ' +
      escapeHtml(photo.title) +
      '"><span class="immersive-position">' +
      (index + 1) +
      "</span>" +
      photoThumb(photo) +
      '<span class="immersive-photo-name">' +
      escapeHtml(photo.title) +
      "</span></button>"
    );
  }

  function immersiveContent() {
    return (
      '<main class="immersive-sequence"><div class="immersive-toolbar"><span><strong>Sequence</strong> · ' +
      state.sequence.length +
      ' 张</span><span>点击任一照片进入大图浏览</span><button type="button" data-action="toggle-immersive">退出沉浸模式</button></div><div class="immersive-track" aria-label="沉浸式照片序列">' +
      state.sequence.map(immersiveSequenceItem).join("") +
      "</div></main>"
    );
  }

  function photoPreview() {
    if (!state.previewPhotoId) return "";
    var index = state.sequence.indexOf(state.previewPhotoId);
    if (index < 0) return "";
    var photo = photoById(state.previewPhotoId);
    return (
      '<div class="photo-preview" role="dialog" aria-modal="true" aria-label="照片大图预览"><button class="preview-backdrop" type="button" data-action="close-photo-preview" aria-label="关闭大图预览"></button><section class="preview-dialog"><header><span>' +
      (index + 1) +
      " / " +
      state.sequence.length +
      '</span><strong>' +
      escapeHtml(photo.title) +
      '</strong><button type="button" data-action="close-photo-preview" aria-label="关闭大图预览">×</button></header><div class="preview-stage"><button class="preview-arrow preview-arrow-left" type="button" data-action="step-photo-preview" data-direction="-1"' +
      (index === 0 ? " disabled" : "") +
      ' aria-label="上一张照片">←</button><div class="preview-photo" style="--tone-a:' +
      photo.a +
      ";--tone-b:" +
      photo.b +
      '"></div><button class="preview-arrow preview-arrow-right" type="button" data-action="step-photo-preview" data-direction="1"' +
      (index === state.sequence.length - 1 ? " disabled" : "") +
      ' aria-label="下一张照片">→</button></div><footer><span>' +
      escapeHtml(photo.meta) +
      " · " +
      photo.id +
      "</span><span>键盘 ← → 浏览 · Esc 退出</span></footer></section></div>"
    );
  }

  function stageContent() {
    if (state.stage === "contact") return contactContent();
    if (state.stage === "sequence") return sequenceContent();
    return compareContent();
  }

  function render() {
    var content = state.immersive
      ? immersiveContent()
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
    state.immersive = false;
    state.previewPhotoId = null;
    render();
  }

  function toggleContactPhoto(id) {
    if (state.pool.indexOf(id) >= 0) return;
    var index = state.selected.indexOf(id);
    if (index >= 0) {
      state.selected.splice(index, 1);
    } else {
      state.selected.push(id);
    }
    render();
  }

  function addSelectedToPool() {
    if (!state.selected.length) return;
    state.pool = uniqueIds(state.pool.concat(state.selected));
    state.selected = [];
    state.stage = "sequence";
    state.notice = "勾选 Pool 照片加入 Sequence；再次点击即可移除。";
    render();
  }

  function toggleSequencePhoto(id) {
    if (state.pool.indexOf(id) < 0) return;
    var index = state.sequence.indexOf(id);
    if (index >= 0) {
      state.sequence.splice(index, 1);
      state.notice = photoById(id).title + " 已从 Sequence 移除。";
    } else {
      state.sequence.push(id);
      state.notice = photoById(id).title + " 已加入 Sequence。";
    }
    render();
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

  function resizeSequencePhoto(id, delta) {
    if (state.sequence.indexOf(id) < 0) return;
    var nextSize = Math.max(
      120,
      Math.min(360, sequencePhotoSize(id) + Number(delta))
    );
    state.sequencePhotoSizes[id] = nextSize;
    state.notice = photoById(id).title + " 已调整为 " + nextSize + " px。";
    render();
  }

  function updateLayoutRange(target) {
    var moduleName = target.getAttribute("data-module");
    var property = target.getAttribute("data-property");
    var value = Number(target.value);
    var suffix = target.getAttribute("data-suffix") || "";
    if (!Number.isFinite(value)) return;

    if (moduleName === "sequence" && property === "frameHeight") {
      state.sequenceFrameHeight = value;
      var board = document.querySelector(".sequence-board");
      if (board && board.style) {
        board.style.setProperty("--sequence-frame-height", value + "px");
      }
    } else if (
      state.moduleLayout[moduleName] &&
      Object.prototype.hasOwnProperty.call(state.moduleLayout[moduleName], property)
    ) {
      state.moduleLayout[moduleName][property] = value;
      var moduleElement = document.querySelector(
        '[data-module="' + moduleName + '"]'
      );
      if (moduleElement && moduleElement.style) {
        var unit = property === "x" || property === "width" ? "%" : "px";
        moduleElement.style.setProperty("--module-" + property, value + unit);
      }
      var editor = document.querySelector(".editor-layout");
      if (editor && editor.style) {
        editor.style.setProperty(
          "--editor-canvas-height",
          editorCanvasHeight() + "px"
        );
      }
    }

    var output = document.querySelector(
      '[data-layout-output="' + moduleName + "-" + property + '"]'
    );
    if (output) output.textContent = value + suffix;
  }

  function openPhotoPreview(id) {
    if (state.sequence.indexOf(id) < 0) return;
    state.previewPhotoId = id;
    render();
  }

  function stepPhotoPreview(direction) {
    var index = state.sequence.indexOf(state.previewPhotoId);
    if (index < 0) return;
    var nextIndex = index + Number(direction);
    if (nextIndex < 0 || nextIndex >= state.sequence.length) return;
    state.previewPhotoId = state.sequence[nextIndex];
    render();
  }

  function toggleImmersive() {
    if (!state.sequence.length) return;
    state.immersive = !state.immersive;
    state.layoutEditing = false;
    state.previewPhotoId = null;
    render();
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
    if (action === "toggle-sequence-photo") {
      toggleSequencePhoto(id);
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
    if (action === "resize-sequence-photo") {
      resizeSequencePhoto(id, target.getAttribute("data-delta"));
      return;
    }
    if (action === "toggle-layout-editing") {
      state.layoutEditing = !state.layoutEditing;
      render();
      return;
    }
    if (action === "reset-layout") {
      state.moduleLayout = defaultModuleLayout();
      state.sequenceFrameHeight = 350;
      render();
      return;
    }
    if (action === "toggle-immersive") {
      toggleImmersive();
      return;
    }
    if (action === "open-photo-preview") {
      openPhotoPreview(id);
      return;
    }
    if (action === "close-photo-preview") {
      state.previewPhotoId = null;
      render();
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
      state = createInitialState();
      render();
    }
  });

  document.addEventListener("input", function (event) {
    var target = event.target;
    if (!target) return;
    if (target.getAttribute("data-role") === "layout-range") {
      updateLayoutRange(target);
      return;
    }
    if (target.getAttribute("data-role") === "version-name") {
      state.versionDraftName = target.value;
      return;
    }
    if (target.getAttribute("data-role") !== "version-memo") return;
    var version = versionById(target.getAttribute("data-version-id"));
    if (version) version.memo = target.value;
  });

  document.addEventListener("keydown", function (event) {
    if (!state.previewPhotoId) return;
    var target = event.target;
    var tagName = target && target.tagName ? target.tagName.toLowerCase() : "";
    if (
      tagName === "input" ||
      tagName === "textarea" ||
      (target && target.isContentEditable)
    ) {
      return;
    }
    if (event.key === "Escape") {
      state.previewPhotoId = null;
      render();
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      if (event.preventDefault) event.preventDefault();
      stepPhotoPreview(event.key === "ArrowLeft" ? -1 : 1);
    }
  });

  document.addEventListener("dragstart", function (event) {
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
