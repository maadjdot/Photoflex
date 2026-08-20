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
  var DEMO_SOURCE_ID = "source-demo";
  var photos = seedPhotos.map(function (photo) {
    return Object.assign({ sourceId: DEMO_SOURCE_ID }, photo);
  });
  var importedPhotoUrls = [];
  var nextSourceNumber = 1;
  var nextProjectNumber = 1;
  var MAX_LIBRARY_PHOTOS = 1200;
  var MAX_POOL_PHOTOS = 60;
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
      description: "直接选择两个版本进行比较"
    }
  ];

  var state = createInitialState();
  // The prototype keeps Project records in memory so switching projects can
  // replace the active workspace without destroying another project's work.
  var projects = [];
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
      projectStep: "home",
      projectEntryMode: null,
      projectDraftName: "",
      projectDraftQuestion: "",
      project: null,
      sources: [],
      activeSourceId: null,
      stage: "contact",
      contactPage: 0,
      selected: [],
      pool: [],
      sequence: [],
      selectedSequenceIds: [],
      versions: [],
      compareSelectionIds: [],
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
      versionDraftName: "",
      notice: "从 Home 选择一个 Project，或建立新的 Project。"
    };
    if (typeof window === "undefined" || skipDemo) {
      return initial;
    }

    var query = new URLSearchParams(window.location.search);
    var demo = query.get("demo");
    if (demo === "project") {
      initial.projectStep = "sources";
      initial.projectEntryMode = "question";
      initial.project = {
        id: "project-demo",
        name: "河流向北",
        question: "一段沿河行走的记忆，应该从哪里开始？"
      };
      var readyDemoSource = demoSource("ready");
      readyDemoSource.photoIds = readyDemoSource.photoIds.slice(0, 6);
      readyDemoSource.totalCount = 6;
      readyDemoSource.loadedCount = 6;
      initial.sources = [
        readyDemoSource,
        {
          id: "source-loading-demo",
          name: "旧城补拍",
          status: "partial",
          totalCount: 240,
          loadedCount: 6,
          photoIds: seedPhotos.slice(6).map(function (photo) {
            return photo.id;
          }),
          issue: "6 张已经可以使用，其余照片仍在读取。"
        },
        {
          id: "source-offline-demo",
          name: "移动硬盘 · 夜景",
          status: "offline",
          totalCount: 184,
          loadedCount: 0,
          photoIds: [],
          issue: "移动硬盘目前未连接。"
        },
        {
          id: "source-permission-demo",
          name: "手机导出",
          status: "permission-lost",
          totalCount: 96,
          loadedCount: 0,
          photoIds: [],
          issue: "浏览器已经失去这个资料夹的读取权限。"
        }
      ];
      initial.notice = "验收预置状态：观察不同 Source 状态与下一步出口。";
      return initial;
    }
    if (demo === "sequence") {
      prepareDemoProject(initial, "workspace");
      initial.stage = "sequence";
      initial.pool = ["P01", "P03", "P04", "P06", "P08", "P10"];
      initial.sequence = ["P03", "P01", "P06", "P04", "P08", "P10"];
      initial.notice = "验收预置状态：可直接检查 Pool 勾选与 Sequence 拖曳。";
    }
    if (demo === "compare") {
      prepareDemoProject(initial, "workspace");
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
      initial.compareSelectionIds = ["v1", "v3"];
      initial.notice = "验收预置状态：可直接选择两个版本进行比较。";
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

  function demoSource(status) {
    return {
      id: DEMO_SOURCE_ID,
      name: "北岸散步",
      status: status || "ready",
      totalCount: seedPhotos.length,
      loadedCount: seedPhotos.length,
      photoIds: seedPhotos.map(function (photo) {
        return photo.id;
      }),
      issue: ""
    };
  }

  function prepareDemoProject(targetState, step) {
    targetState.projectStep = step || "sources";
    targetState.projectEntryMode = "photos";
    targetState.project = {
      id: "project-demo",
      name: "河流向北",
      question: ""
    };
    targetState.sources = [demoSource("ready")];
    targetState.activeSourceId = DEMO_SOURCE_ID;
  }

  function cloneState(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function persistActiveProject() {
    if (!state.project || !state.project.id) return;
    var snapshot = cloneState(state);
    if (snapshot.projectStep === "home" || snapshot.projectStep === "create") {
      snapshot.projectStep = "sources";
    }
    var record = projects.find(function (project) {
      return project.id === state.project.id;
    });
    var nextRecord = {
      id: state.project.id,
      name: state.project.name,
      question: state.project.question || "",
      snapshot: snapshot,
      updatedAt: Date.now()
    };
    if (record) {
      Object.assign(record, nextRecord);
    } else {
      projects.push(nextRecord);
    }
  }

  function openProjectHome() {
    persistActiveProject();
    state.projectStep = "home";
    state.projectEntryMode = null;
    state.notice = projects.length
      ? "选择一个 Project 继续，或建立新的 Project。"
      : "还没有 Project；先建立第一个工作空间。";
    render();
  }

  function openProject(id) {
    var record = projects.find(function (project) {
      return project.id === id;
    });
    if (!record || !record.snapshot) return;
    state = cloneState(record.snapshot);
    state.projectStep = "sources";
    state.notice = "已打开“" + record.name + "”；这个 Project 的工作状态已恢复。";
    render();
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

  function sourceById(id) {
    return state.sources.find(function (source) {
      return source.id === id;
    });
  }

  function activeSource() {
    return sourceById(state.activeSourceId);
  }

  function activeSourcePhotos() {
    var source = activeSource();
    if (!source) return [];
    return source.photoIds
      .map(function (id) {
        return photoById(id);
      })
      .filter(Boolean);
  }

  function sourceForPhoto(id) {
    return state.sources.find(function (source) {
      return source.photoIds.indexOf(id) >= 0;
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

  function captureScroll(selector) {
    var element = document.querySelector(selector);
    return {
      top: element ? element.scrollTop : 0,
      left: element ? element.scrollLeft : 0
    };
  }

  function restoreScroll(selector, position) {
    if (!position) return;
    var apply = function () {
      var element = document.querySelector(selector);
      if (!element) return;
      element.scrollTop = position.top;
      element.scrollLeft = position.left;
    };
    // Apply immediately for the prototype test harness and once after layout
    // for a real browser, where a rerender may recalculate overflow later.
    apply();
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(apply);
    if (typeof setTimeout === "function") setTimeout(apply, 0);
  }

  function restoreScrollPositions(positions) {
    Object.keys(positions).forEach(function (selector) {
      restoreScroll(selector, positions[selector]);
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
      return activeSourcePhotos().map(function (photo) {
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

  function sourceNameFromFiles(files, fallback) {
    var firstFile = files[0];
    var firstPath = firstFile ? firstFile.webkitRelativePath || "" : "";
    return firstPath.indexOf("/") >= 0
      ? firstPath.split("/")[0]
      : fallback;
  }

  function renderSourceProgress() {
    // Once the participant has opened a Contact Sheet, background chunks must
    // not replace the whole workspace DOM and jump their scroll position.
    if (state.projectStep === "sources") render();
  }

  function appendSourceImportChunk(source, files, jpegCount, startIndex) {
    if (!sourceById(source.id)) return;
    var chunkSize =
      typeof window === "undefined" || !window.setTimeout ? files.length : 60;
    var endIndex = Math.min(files.length, startIndex + chunkSize);
    files.slice(startIndex, endIndex).forEach(function (file, chunkIndex) {
      var index = startIndex + chunkIndex;
      var objectUrl = URL.createObjectURL(file);
      importedPhotoUrls.push(objectUrl);
      var photoId =
        source.id.replace(/^source-/, "S").replace(/[^a-z0-9-]/gi, "") +
        "-P" +
        String(index + 1).padStart(4, "0");
      photos.push({
        id: photoId,
        sourceId: source.id,
        title: file.name,
        meta: "本地 JPEG · " + formatFileSize(file.size),
        url: objectUrl,
        local: true
      });
      source.photoIds.push(photoId);
    });
    source.loadedCount = source.photoIds.length;
    if (endIndex < files.length) {
      source.status = "partial";
      source.issue =
        source.loadedCount +
        " 张已经可以使用；其余照片仍在读取，不影响进入 Contact Sheet。";
      state.notice =
        "“" +
        source.name +
        "”已读取 " +
        source.loadedCount +
        " / " +
        jpegCount +
        " 张；可以先开始选片。";
      renderSourceProgress();
      window.setTimeout(function () {
        appendSourceImportChunk(source, files, jpegCount, endIndex);
      }, 16);
      return;
    }
    source.status =
      jpegCount > MAX_LIBRARY_PHOTOS ? "partial" : "ready";
    source.issue =
      jpegCount > MAX_LIBRARY_PHOTOS
        ? "资料夹共有 " +
          jpegCount +
          " 张 JPEG；研究原型先读取前 " +
          MAX_LIBRARY_PHOTOS +
          " 张，已经可以开始选片。"
        : "";
    state.notice =
      "“" +
      source.name +
      "”已读取 " +
      source.loadedCount +
      " 张；可以打开 Contact Sheet，也可以继续添加其他资料夹。";
    renderSourceProgress();
  }

  function importSourceFolder(fileList) {
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

    var sourceNumber = nextSourceNumber;
    nextSourceNumber += 1;
    var source = {
      id: "source-local-" + sourceNumber,
      name: sourceNameFromFiles(
        jpegFiles.length ? jpegFiles : allFiles,
        "照片资料夹 " + sourceNumber
      ),
      status: jpegFiles.length ? "loading" : "permission-lost",
      totalCount: jpegFiles.length,
      loadedCount: 0,
      photoIds: [],
      issue: jpegFiles.length
        ? "正在建立本地照片索引；已经读取的照片会立即可用。"
        : "没有取得可读取的 JPEG；请检查资料夹内容或重新授权。"
    };
    state.sources.push(source);
    state.projectStep = "sources";
    state.notice = jpegFiles.length
      ? "已添加“" + source.name + "”，正在读取照片。"
      : "资料夹尚未取得读取权限；可以重新选择，不影响其他 Source。";
    render();
    if (!jpegFiles.length) return;

    var limitedFiles = jpegFiles.slice(0, MAX_LIBRARY_PHOTOS);
    if (typeof window === "undefined" || !window.setTimeout) {
      appendSourceImportChunk(source, limitedFiles, jpegFiles.length, 0);
      return;
    }
    window.setTimeout(function () {
      appendSourceImportChunk(source, limitedFiles, jpegFiles.length, 0);
    }, 80);
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

  function sourceStatusMeta(status) {
    var statuses = {
      ready: {
        label: "Ready",
        detail: "照片已经读取完成，可以进入 Contact Sheet。"
      },
      loading: {
        label: "Loading",
        detail: "正在读取；其他 Source 和已经完成的工作不受影响。"
      },
      partial: {
        label: "Partial",
        detail: "已有部分照片可用，可以先开始选片。"
      },
      offline: {
        label: "Offline",
        detail: "原资料夹暂时不在线；已读取照片仍可继续使用。"
      },
      "permission-lost": {
        label: "Permission Lost",
        detail: "浏览器需要重新取得这个资料夹的读取权限。"
      }
    };
    return statuses[status] || statuses.loading;
  }

  function projectWelcomeContent() {
    var projectCards = projects.length
      ? '<section class="project-library"><div class="project-library-heading"><div><p class="eyebrow">Your Projects</p><h2>继续一个工作空间</h2></div><span>' +
        projects.length +
        " 个 Project 保存在本轮内存中</span></div><div class=\"project-card-grid\" data-project-list>" +
        projects
          .map(function (project) {
            var snapshot = project.snapshot || {};
            var sources = snapshot.sources || [];
            var pool = snapshot.pool || [];
            var stageLabel =
              snapshot.projectStep === "workspace"
                ? (snapshot.stage || "contact") === "contact"
                  ? "Contact Sheet"
                  : (snapshot.stage || "contact") === "sequence"
                    ? "Sequence + Pool"
                    : "Compare"
                : "Project Stage";
            return (
              '<article class="project-card"><div class="project-card-top"><span class="project-card-status">' +
              escapeHtml(stageLabel) +
              '</span><span>' +
              sources.length +
              " Sources</span></div><h3>" +
              escapeHtml(project.name) +
              '</h3><p>' +
              escapeHtml(project.question || "还没有写下核心问题。") +
              '</p><footer><span>Pool ' +
              pool.length +
              " 张</span><button type=\"button\" data-action=\"open-project\" data-id=\"" +
              escapeHtml(project.id) +
              '\">打开 Project →</button></footer></article>'
            );
          })
          .join("") +
        "</div></section>"
      : '<section class="project-library project-library-empty"><p class="eyebrow">Your Projects</p><h2>还没有 Project</h2><p>建立后，照片资料夹、Pool、Sequence 和版本都会留在各自的工作空间里。</p></section>';
    return (
      '<main class="project-flow project-welcome"><header class="project-intro"><span class="prototype-flag">Prototype · Memory only</span><p class="eyebrow">PhotoFlex Home</p><h1>管理你的 Projects</h1><p>每个 Project 都是独立的选片工作空间：Source、Pool、Sequence 和版本互不覆盖。选择已有 Project，或从下面建立新的 Project。</p></header>' +
      projectCards +
      '<section class="project-entry-grid"><button type="button" data-action="choose-project-entry" data-mode="photos"><span class="entry-number">01</span><strong>从已有照片开始</strong><small>先建立 Project，再连续添加一个或多个照片资料夹。</small><em>适合已经准备好拍摄资料的工作</em></button>' +
      '<button type="button" data-action="choose-project-entry" data-mode="question"><span class="entry-number">02</span><strong>从核心问题开始</strong><small>先写下这次编辑想回答的问题，照片资料夹可以之后再加。</small><em>适合从命题或叙事方向开始</em></button></section>' +
      '<footer class="project-memory-note">本轮原型只保存在浏览器内存中，不会建立真实 .photoflex 文件。</footer></main>'
    );
  }

  function projectCreateContent() {
    var questionFirst = state.projectEntryMode === "question";
    return (
      '<main class="project-flow project-create"><button class="project-back" type="button" data-action="back-project-welcome">← 返回起点</button><header class="project-intro"><p class="eyebrow">' +
      (questionFirst ? "从核心问题开始" : "从已有照片开始") +
      '</p><h1>建立一个 Project</h1><p>Project 是这次选片、排序和版本比较共同所属的工作空间。</p></header><section class="project-form"><label><span>Project 名称</span><input type="text" data-role="project-name" value="' +
      escapeHtml(state.projectDraftName) +
      '" placeholder="例如：河流向北" autofocus></label><label><span>核心问题' +
      (questionFirst ? "" : "（可选）") +
      '</span><textarea data-role="project-question" placeholder="例如：这段故事应该从哪个瞬间开始？">' +
      escapeHtml(state.projectDraftQuestion) +
      '</textarea></label><button class="btn btn-primary project-create-button" type="button" data-action="create-project">建立 Project →</button><span class="project-form-notice">' +
      escapeHtml(state.notice) +
      "</span></section></main>"
    );
  }

  function sourceCard(source) {
    var meta = sourceStatusMeta(source.status);
    var canOpen = source.photoIds.length > 0;
    var openLabel =
      source.status === "ready"
        ? "打开 Contact Sheet"
        : source.status === "offline"
          ? "使用已读取照片"
          : "先用已读取照片";
    var reconnectLabel =
      source.status === "offline" || source.status === "permission-lost"
        ? "另加替代 Source"
        : "再次选择为新 Source";
    return (
      '<article class="source-card is-' +
      source.status +
      '"><header><span class="source-status">' +
      escapeHtml(meta.label) +
      '</span><span class="source-count">' +
      source.loadedCount +
      " / " +
      source.totalCount +
      ' 张</span></header><div class="source-card-copy"><strong>' +
      escapeHtml(source.name) +
      '</strong><p>' +
      escapeHtml(source.issue || meta.detail) +
      '</p></div><div class="source-card-actions"><button type="button" data-action="open-source" data-id="' +
      source.id +
      '"' +
      (canOpen ? "" : " disabled") +
      ">" +
      openLabel +
      '</button><label class="source-reconnect">' +
      reconnectLabel +
      '<input type="file" data-role="source-folder" accept=".jpg,.jpeg,image/jpeg" multiple webkitdirectory directory></label></div><details class="source-research-controls"><summary>研究状态测试</summary><div><button type="button" data-action="set-source-status" data-id="' +
      source.id +
      '" data-status="loading">Loading</button><button type="button" data-action="set-source-status" data-id="' +
      source.id +
      '" data-status="partial">Partial</button><button type="button" data-action="set-source-status" data-id="' +
      source.id +
      '" data-status="offline">Offline</button><button type="button" data-action="set-source-status" data-id="' +
      source.id +
      '" data-status="permission-lost">Permission Lost</button><button type="button" data-action="set-source-status" data-id="' +
      source.id +
      '" data-status="ready">恢复 Ready</button></div></details></article>'
    );
  }

  function sourceHubContent() {
    var project = state.project || { name: "未命名 Project", question: "" };
    return (
      '<main class="project-flow source-hub"><header class="source-hub-header"><div><span class="prototype-flag">Prototype · Memory only</span><p class="eyebrow">Project</p><h1>' +
      escapeHtml(project.name) +
      '</h1><p>' +
      escapeHtml(
        project.question ||
          "把属于同一次编辑工作的照片资料夹放在这里。每个 Source 都保持独立。"
      ) +
      '</p></div><div class="source-hub-actions"><label class="folder-import-button">＋ 添加照片资料夹<input type="file" data-role="source-folder" accept=".jpg,.jpeg,image/jpeg" multiple webkitdirectory directory></label><button type="button" data-action="add-demo-sources">加入两个示例 Source</button></div></header>' +
      '<section class="relationship-strip" aria-label="Project 与 Source 关系"><span><strong>1 Project</strong>' +
      state.sources.length +
      ' 个独立 Source</span><span aria-hidden="true">→</span><span><strong>打开 1 个 Source</strong>进入它的 Contact Sheet</span><span aria-hidden="true">→</span><span><strong>跨 Source</strong>照片汇入同一个 Pool</span></section>' +
      '<section class="source-grid">' +
      (state.sources.length
        ? state.sources.map(sourceCard).join("")
        : '<div class="empty-sources"><strong>还没有照片资料夹</strong><span>添加第一个 Source；之后可以继续添加，不会覆盖前一个资料夹。</span></div>') +
      '</section><section class="source-status-legend"><strong>读取状态不会阻塞整个 Project</strong><span><b>Loading</b> 正在读取</span><span><b>Partial</b> 可先用已读取照片</span><span><b>Offline</b> 其他 Source 仍可工作</span><span><b>Permission Lost</b> 重新选择资料夹</span></section><footer class="source-hub-footer"><span>' +
      escapeHtml(state.notice) +
      '</span><div><button type="button" data-action="open-project-home">Project Home</button><button type="button" data-action="new-project">建立另一个 Project</button></div></footer></main>'
    );
  }

  function projectFlowContent() {
    if (state.projectStep === "home" || state.projectStep === "welcome") return projectWelcomeContent();
    if (state.projectStep === "create") return projectCreateContent();
    return sourceHubContent();
  }

  function canOpenStage(stageId) {
    if (stageId === "contact") return Boolean(activeSource());
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
        lede: "直接选择两个版本进行比较，Memo 用来记录你的判断。"
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
    return Math.max(1, Math.ceil(activeSourcePhotos().length / CONTACT_PAGE_SIZE));
  }

  function contactPagePhotos() {
    var safePage = clamp(state.contactPage, 0, contactPageCount() - 1);
    state.contactPage = safePage;
    var start = safePage * CONTACT_PAGE_SIZE;
    return activeSourcePhotos().slice(start, start + CONTACT_PAGE_SIZE);
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
    var source = activeSource();
    var pagePhotos = contactPagePhotos();
    var pageCount = contactPageCount();
    var buttonLabel = state.pool.length
      ? "再加入 Pool（" + state.selected.length + "）"
      : "加入 Pool（" + state.selected.length + "）";
    return (
      '<section class="contact-stage">' +
      '<section class="library-import-panel"><div><p class="eyebrow">当前 Source · ' +
      escapeHtml(sourceStatusMeta(source.status).label) +
      '</p><strong>' +
      escapeHtml(source.name) +
      "</strong><span>这里只显示当前资料夹的照片；加入 Pool 后，切换 Source 也不会丢失。</span></div>" +
      '<span class="source-stage-note">从顶部 Project 模块返回 Home；当前 Source 的照片和 Pool 会继续保留。</span></section>' +
      '<div class="contact-summary"><span>图库 ' +
      activeSourcePhotos().length +
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
    var source = sourceForPhoto(id);
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
      '</span><span class="pool-source-name">' +
      escapeHtml(source ? source.name : "未知 Source") +
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
      '<aside class="version-shelf"><span class="version-shelf-label">选择两个版本</span><div class="version-pack-list">' +
      state.versions
        .map(function (version) {
          var selectedIndex = state.compareSelectionIds.indexOf(version.id);
          var selected = selectedIndex >= 0;
          return (
            '<button class="version-pack' +
            (selected ? " is-comparing" : "") +
            '" type="button" data-action="toggle-compare-version" data-id="' +
            version.id +
            '" aria-pressed="' +
            selected +
            '"><span class="version-pack-icon">▰</span><span class="version-pack-copy"><strong>' +
            escapeHtml(version.label) +
            "</strong><small>" +
            (selected ? "已选择 " + (selectedIndex + 1) + " / 2" : "点击选择") +
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
      : "保存首个版本";
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
      '" data-sequence-dropzone="true" data-wheel-owner="sequence" style="--sequence-frame-height:' +
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
    return state.compareSelectionIds
      .map(function (id) {
        return versionById(id);
      })
      .filter(Boolean)
      .slice(0, 2);
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
    return (
      '<article class="compare-row"><section class="version-panel"><header><h2>' +
      escapeHtml(version.label) +
      '</h2><span class="compare-selected-label">已选择进行比较</span></header><button class="version-open" type="button" data-action="open-version-preview" data-id="' +
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
        '<div class="empty-compare"><strong>请选择两个版本</strong><span>在标题右侧选择两个已保存版本，才能开始比较。</span>' +
        '<button class="btn btn-primary" type="button" data-action="goto-stage" data-stage="sequence">返回 Sequence</button></div>'
      );
    }
    return (
      '<section class="compare-stack"><p class="compare-selection-hint">选择两个版本 · 当前已选择 ' +
      pair.length +
      " / 2</p>" +
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
      '>移除选中</button><button class="whiteboard-discard" type="button" data-action="exit-whiteboard-discard">放弃改动退出</button><button class="whiteboard-exit" type="button" data-action="exit-whiteboard-save">保留排序退出</button></div></div><div class="whiteboard-viewport" data-wheel-owner="whiteboard"><div class="whiteboard-space" style="width:' +
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
      '">退出序列全景</button></header><section class="panorama-strip" data-wheel-owner="panorama" aria-label="照片序列全景">' +
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
    var content;
    persistActiveProject();
    if (state.projectStep !== "workspace") {
      content = projectFlowContent();
    } else {
      content = state.whiteboard
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
        : '<div class="prototype-shell"><header class="app-header"><div class="brand-block"><span class="prototype-flag">Prototype · Memory only</span><button class="project-name" type="button" data-action="open-project-home" aria-label="打开 Project Home">' +
          escapeHtml(state.project ? state.project.name : "未命名 Project") +
          " · " +
          state.sources.length +
          " Sources</button></div>" +
          topStageNavigation() +
          '<button class="reset-button" type="button" data-action="reset">清空本轮编辑</button></header><main class="app-main">' +
          pageHeading() +
          stageContent() +
          "</main></div>";
    }
    document.getElementById("app").innerHTML =
      content + (state.projectStep === "workspace" ? photoPreview() : "");
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

  function chooseProjectEntry(mode) {
    if (mode !== "photos" && mode !== "question") return;
    state.projectEntryMode = mode;
    state.projectStep = "create";
    state.notice =
      mode === "question"
        ? "先写下 Project 名称和核心问题。"
        : "先命名 Project，建立后即可添加照片资料夹。";
    render();
  }

  function createProject() {
    var name = state.projectDraftName.trim();
    if (!name) {
      state.notice = "请先输入 Project 名称。";
      render();
      return;
    }
    state.project = {
      id: "project-local-" + nextProjectNumber++,
      name: name,
      question: state.projectDraftQuestion.trim()
    };
    state.projectDraftName = "";
    state.projectDraftQuestion = "";
    state.projectStep = "sources";
    state.notice =
      "Project 已建立。现在添加第一个 Source；之后可以继续添加，不会覆盖前一个资料夹。";
    render();
  }

  function secondDemoSource() {
    var sourceId = "source-demo-2";
    var photoIds = seedPhotos.slice(6).map(function (photo, index) {
      var id = "Q" + String(index + 1).padStart(2, "0");
      if (!photoById(id)) {
        photos.push(
          Object.assign({}, photo, {
            id: id,
            sourceId: sourceId,
            title: "南岸 " + String(index + 1).padStart(2, "0")
          })
        );
      }
      return id;
    });
    return {
      id: sourceId,
      name: "南岸补拍",
      status: "ready",
      totalCount: photoIds.length,
      loadedCount: photoIds.length,
      photoIds: photoIds,
      issue: ""
    };
  }

  function addDemoSources() {
    if (!sourceById(DEMO_SOURCE_ID)) state.sources.push(demoSource("ready"));
    if (!sourceById("source-demo-2")) state.sources.push(secondDemoSource());
    state.notice =
      "已加入两个独立示例 Source。请分别打开它们选片，观察 Pool 是否跨资料夹保留。";
    render();
  }

  function openSource(id) {
    var source = sourceById(id);
    if (!source || !source.photoIds.length) return;
    state.activeSourceId = id;
    state.projectStep = "workspace";
    state.stage = "contact";
    state.contactPage = 0;
    state.selected = [];
    state.previewPhotoId = null;
    state.previewContextIds = [];
    state.previewSource = null;
    state.notice =
      "正在浏览“" +
      source.name +
      "”；加入 Pool 的照片会继续保留在当前 Project。";
    render();
  }

  function openSourceHub() {
    state.projectStep = "sources";
    state.selected = [];
    state.whiteboard = false;
    state.sequencePanorama = false;
    state.immersiveVersionId = null;
    state.previewPhotoId = null;
    state.previewContextIds = [];
    state.previewSource = null;
    state.notice =
      "可以打开另一个 Source；当前 Pool、Sequence 和 Version 不会被清空。";
    render();
  }

  function setSourceStatus(id, status) {
    var source = sourceById(id);
    if (
      !source ||
      ["ready", "loading", "partial", "offline", "permission-lost"].indexOf(
        status
      ) < 0
    ) {
      return;
    }
    source.status = status;
    var messages = {
      ready: "读取已经恢复，可以正常打开 Contact Sheet。",
      loading: "正在读取照片；可以继续管理其他 Source。",
      partial: "读取尚未完成；已经读取的照片可以先使用。",
      offline: "资料夹目前离线；已读取照片仍保留在 Project 中。",
      "permission-lost": "读取权限已失效；请重新选择资料夹授权。"
    };
    source.issue = messages[status];
    state.notice = "“" + source.name + "”现在显示为 " + sourceStatusMeta(status).label + "。";
    render();
  }

  function newProject() {
    persistActiveProject();
    state = createInitialState(true);
    state.projectStep = "home";
    state.notice = "旧 Project 已保留；选择入口建立一个新的 Project。";
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
      " 张，Pool 上限为 " +
      MAX_POOL_PHOTOS +
      " 张。";
    render();
  }

  function toggleContactPhoto(id) {
    if (state.pool.indexOf(id) >= 0) return;
    var index = state.selected.indexOf(id);
    if (index >= 0) {
      state.selected.splice(index, 1);
    } else {
      if (state.pool.length + state.selected.length >= MAX_POOL_PHOTOS) {
        state.notice =
          "Pool 上限是 " +
          MAX_POOL_PHOTOS +
          " 张；请先取消一张当前选择或从 Pool 删除照片。";
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
      state.notice = "Pool 已达到 " + MAX_POOL_PHOTOS + " 张上限。";
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
    var scrollPositions = {
      ".pool-column": captureScroll(".pool-column"),
      ".sequence-board": captureScroll(".sequence-board")
    };
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
    restoreScrollPositions(scrollPositions);
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
    var scrollPositions = state.whiteboard
      ? { ".whiteboard-viewport": captureScroll(".whiteboard-viewport") }
      : {
          ".sequence-board": captureScroll(".sequence-board"),
          ".pool-column": captureScroll(".pool-column")
        };
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
    restoreScrollPositions(scrollPositions);
  }

  function removePoolPhoto(id) {
    var scrollPositions = {
      ".pool-column": captureScroll(".pool-column"),
      ".sequence-board": captureScroll(".sequence-board")
    };
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
    var photo = photoById(id);
    state.notice =
      (photo ? photo.title : "照片") +
      " 已从 Pool 删除；Contact Sheet 已恢复彩色。";
    if (!state.pool.length) state.stage = "contact";
    render();
    restoreScrollPositions(scrollPositions);
  }

  function saveVersion() {
    if (!state.sequence.length) return;
    var previousSelection = state.compareSelectionIds.slice();
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

    if (!previousSelection.length) {
      state.compareSelectionIds = [version.id];
    } else if (previousSelection.length === 1) {
      state.compareSelectionIds = uniqueIds(previousSelection.concat(version.id)).slice(0, 2);
    } else {
      state.compareSelectionIds = [previousSelection[0], version.id];
    }
    state.stage = state.compareSelectionIds.length === 2 ? "compare" : "sequence";
    state.notice =
      version.label +
      " 已保存。请选择两个版本进行比较。";
    render();
  }

  function toggleCompareVersion(id) {
    var version = versionById(id);
    if (!version) return;
    var index = state.compareSelectionIds.indexOf(id);
    if (index >= 0) {
      state.compareSelectionIds.splice(index, 1);
      state.notice = version.label + " 已取消选择。请选择两个版本进行比较。";
      render();
      return;
    }
    if (state.compareSelectionIds.length >= 2) {
      state.notice = "已经选择两个版本；请先取消一个版本，再选择新的版本。";
      render();
      return;
    }
    state.compareSelectionIds.push(id);
    state.stage = state.compareSelectionIds.length === 2 ? "compare" : state.stage;
    state.notice =
      version.label +
      " 已选择" +
      (state.compareSelectionIds.length === 2 ? "，现在可以比较。" : "，还需要选择一个版本。");
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
    state.stage = "contact";
    state.contactPage = 0;
    state.selected = [];
    state.pool = [];
    state.sequence = [];
    state.selectedSequenceIds = [];
    state.versions = [];
    state.compareSelectionIds = [];
    state.workingFromVersionId = null;
    state.sequenceView = "horizontal";
    state.sequenceFrameHeight = 290;
    state.sequencePhotoSizes = {};
    state.moduleLayout = defaultModuleLayout();
    state.whiteboard = false;
    state.whiteboardZoom = 0.75;
    state.whiteboardItems = {};
    state.whiteboardEntrySequence = [];
    state.whiteboardEntryItems = {};
    state.previewPhotoId = null;
    state.previewContextIds = [];
    state.previewSource = null;
    state.sequencePanorama = false;
    state.immersiveVersionId = null;
    state.versionDraftName = "";
    state.projectStep = state.activeSourceId ? "workspace" : "sources";
    state.notice =
      "本轮 Pool、Sequence 和 Version 已清空；Project 与所有 Source 仍保留。";
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

    if (action === "choose-project-entry") {
      chooseProjectEntry(target.getAttribute("data-mode"));
      return;
    }
    if (action === "back-project-welcome") {
      state.projectStep = "home";
      state.notice = "选择这次 Project 的起点。";
      render();
      return;
    }
    if (action === "create-project") {
      createProject();
      return;
    }
    if (action === "add-demo-sources") {
      addDemoSources();
      return;
    }
    if (action === "open-source") {
      openSource(id);
      return;
    }
    if (action === "open-project") {
      openProject(id);
      return;
    }
    if (action === "open-project-home") {
      openProjectHome();
      return;
    }
    if (action === "open-source-hub") {
      openSourceHub();
      return;
    }
    if (action === "set-source-status") {
      setSourceStatus(id, target.getAttribute("data-status"));
      return;
    }
    if (action === "new-project") {
      newProject();
      return;
    }
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
    if (action === "toggle-compare-version") {
      toggleCompareVersion(id);
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
    if (!target || target.getAttribute("data-role") !== "source-folder") {
      return;
    }
    importSourceFolder(target.files);
    target.value = "";
  });

  document.addEventListener("input", function (event) {
    var target = event.target;
    if (!target) return;
    if (target.getAttribute("data-role") === "project-name") {
      state.projectDraftName = target.value;
      return;
    }
    if (target.getAttribute("data-role") === "project-question") {
      state.projectDraftQuestion = target.value;
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

  function wheelDeltaPixels(event, key) {
    var value = Number(event[key]) || 0;
    if (event.deltaMode === 1) return value * 16;
    if (event.deltaMode === 2) {
      var viewportSize =
        typeof window !== "undefined" && window.innerWidth
          ? window.innerWidth
          : 800;
      return value * viewportSize;
    }
    return value;
  }

  document.addEventListener(
    "wheel",
    function (event) {
      var target = event.target;
      if (!target || !target.closest) return;

      var whiteboardViewport = target.closest(".whiteboard-viewport");
      var sequenceColumn = target.closest(".sequence-column");
      var horizontalViewport = whiteboardViewport
        ? null
        : target.closest(
            ".sequence-board.view-horizontal, .panorama-strip"
          );
      if (!whiteboardViewport && !horizontalViewport && sequenceColumn) {
        horizontalViewport = sequenceColumn.querySelector
          ? sequenceColumn.querySelector(".sequence-board.view-horizontal")
          : null;
      }
      var viewport = whiteboardViewport || horizontalViewport;
      if (!viewport || event.ctrlKey) return;

      var deltaX = wheelDeltaPixels(event, "deltaX");
      var deltaY = wheelDeltaPixels(event, "deltaY");

      // Shift + wheel is the standard fallback for horizontal scrolling.
      if (event.shiftKey && Math.abs(deltaX) < 0.5 && Math.abs(deltaY) >= 0.5) {
        deltaX = deltaY;
        deltaY = 0;
      }

      var isWhiteboard = Boolean(whiteboardViewport);
      var isSequence = Boolean(
        horizontalViewport &&
          horizontalViewport.classList &&
          horizontalViewport.classList.contains("sequence-board")
      );
      if (!isSequence && horizontalViewport && horizontalViewport.selector) {
        isSequence = horizontalViewport.selector.indexOf("sequence-board") >= 0;
      }
      var isHorizontalGesture =
        Math.abs(deltaX) >= 0.5 &&
        (Math.abs(deltaX) > Math.abs(deltaY) ||
          (isSequence && Math.abs(deltaX) >= Math.abs(deltaY) * 0.35));
      if (!isWhiteboard && !isHorizontalGesture) return;
      if (isWhiteboard && Math.abs(deltaX) + Math.abs(deltaY) < 0.5) return;

      // Capture the gesture before it can chain to the document or browser
      // history navigation, then apply the motion to the intended viewport.
      if (event.preventDefault) event.preventDefault();
      if (event.stopPropagation) event.stopPropagation();
      if (event.stopImmediatePropagation) event.stopImmediatePropagation();
      viewport.scrollLeft += deltaX;
      if (isWhiteboard) viewport.scrollTop += deltaY;
    },
    { capture: true, passive: false }
  );

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
