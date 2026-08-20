"use strict";

var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");

var appNode = { innerHTML: "" };
var listeners = {};
var scrollCalls = [];
var mockElements = {};
var objectUrlCalls = 0;
var revokedUrls = [];

global.URL.createObjectURL = function () {
  objectUrlCalls += 1;
  return "blob:local-photo-" + objectUrlCalls;
};
global.URL.revokeObjectURL = function (url) {
  revokedUrls.push(url);
};

function createMockElement(selector) {
  var classes = {};
  return {
    selector: selector,
    scrollTop: 0,
    scrollLeft: 0,
    classList: {
      add: function (name) { classes[name] = true; },
      remove: function (name) { delete classes[name]; },
      toggle: function (name, force) {
        classes[name] = force == null ? !classes[name] : Boolean(force);
      },
      contains: function (name) { return Boolean(classes[name]); }
    },
    style: {
      values: {},
      setProperty: function (name, value) {
        this.values[name] = value;
      }
    },
    getBoundingClientRect: function () {
      return { left: 0, top: 0, width: 1200, height: 700 };
    },
    getAttribute: function (name) {
      var match = selector.match(/data-whiteboard-item="([^"]+)"/);
      return name === "data-whiteboard-item" && match ? match[1] : null;
    },
    scrollBy: function (options) {
      scrollCalls.push(options);
    }
  };
}

function elementFor(selector) {
  if (!mockElements[selector]) {
    mockElements[selector] = createMockElement(selector);
  }
  return mockElements[selector];
}

global.document = {
  getElementById: function (id) {
    if (id === "app") return appNode;
    return null;
  },
  querySelector: function (selector) {
    if (selector === ".sequence-board.view-horizontal") {
      return elementFor(".sequence-board");
    }
    if (
      selector === ".sequence-board" ||
      selector === ".pool-column" ||
      selector === ".editor-layout" ||
      selector === ".whiteboard-viewport" ||
      selector === ".whiteboard-canvas" ||
      selector === ".whiteboard-selection-box" ||
      selector.indexOf('[data-module="') === 0 ||
      selector.indexOf('[data-drag-id="') === 0 ||
      selector.indexOf('[data-whiteboard-item="') === 0
    ) {
      return elementFor(selector);
    }
    return null;
  },
  querySelectorAll: function (selector) {
    if (selector !== "[data-whiteboard-item]") return [];
    return Array.from(
      appNode.innerHTML.matchAll(/data-whiteboard-item="([^"]+)"/g),
      function (match) {
        return elementFor('[data-whiteboard-item="' + match[1] + '"]');
      }
    );
  },
  addEventListener: function (type, handler) {
    listeners[type] = handler;
  }
};

function actionTarget(action, attributes) {
  var attrs = Object.assign({ "data-action": action }, attributes || {});
  return {
    getAttribute: function (name) {
      return attrs[name] || null;
    }
  };
}

function click(action, attributes) {
  var target = actionTarget(action, attributes);
  listeners.click({
    target: {
      closest: function () {
        return target;
      }
    }
  });
}

function expectText(text, message) {
  assert.ok(
    appNode.innerHTML.indexOf(text) >= 0,
    message || "Expected rendered text: " + text
  );
}

function expectNoText(text, message) {
  assert.equal(
    appNode.innerHTML.indexOf(text),
    -1,
    message || "Unexpected rendered text: " + text
  );
}

function countText(text) {
  return appNode.innerHTML.split(text).length - 1;
}

function compareStackHtml() {
  var start = appNode.innerHTML.indexOf('<section class="compare-stack">');
  assert.ok(start >= 0, "Compare stack not found");
  return appNode.innerHTML.slice(start);
}

function contactCardStart(id) {
  var idPosition = appNode.innerHTML.indexOf('data-photo-id="' + id + '"');
  assert.ok(idPosition >= 0, "Contact card not found: " + id);
  return appNode.innerHTML.lastIndexOf('<article class="contact-photo', idPosition);
}

function contactCardOpeningTag(id) {
  var start = contactCardStart(id);
  var end = appNode.innerHTML.indexOf(">", start);
  return appNode.innerHTML.slice(start, end + 1);
}

function contactCardHtml(id) {
  var start = contactCardStart(id);
  var end = appNode.innerHTML.indexOf("</article>", start);
  return appNode.innerHTML.slice(start, end + 10);
}

function poolCardHtml(id) {
  var match = appNode.innerHTML.match(
    new RegExp(
      '<button class="pool-selection-surface"[^>]*data-id="' + id + '"[^>]*>'
    )
  );
  assert.ok(match && match.index >= 0, "Pool card not found: " + id);
  var start = appNode.innerHTML.lastIndexOf('<article class="pool-card', match.index);
  var end = appNode.innerHTML.indexOf("</article>", start);
  return appNode.innerHTML.slice(start, end + 10);
}

function drag(sourceId, targetId) {
  var classList = {
    add: function () {},
    remove: function () {}
  };
  var sourceTarget = {
    classList: classList,
    getAttribute: function (name) {
      return name === "data-drag-id" ? sourceId : null;
    },
    closest: function (selector) {
      return selector === "[data-drag-id]" ? this : null;
    }
  };
  var transfer = {
    effectAllowed: "",
    dropEffect: "",
    value: "",
    setData: function (_type, value) {
      this.value = value;
    },
    getData: function () {
      return this.value;
    }
  };
  listeners.dragstart({ target: sourceTarget, dataTransfer: transfer });

  var targetItem = {
    getAttribute: function (name) {
      return name === "data-drop-id" ? targetId : null;
    }
  };
  listeners.drop({
    preventDefault: function () {},
    dataTransfer: transfer,
    target: {
      closest: function (selector) {
        if (selector === "[data-sequence-dropzone]") return {};
        if (selector === "[data-drop-id]") return targetItem;
        return null;
      }
    }
  });
}

function pointerGesture(attributes, dx, dy) {
  var target = {
    getAttribute: function (name) {
      return attributes[name] || null;
    },
    closest: function (selector) {
      if (
        selector === "[data-resize-kind]" &&
        attributes["data-resize-kind"]
      ) {
        return this;
      }
      if (
        selector === "[data-module-drag-handle]" &&
        attributes["data-module-drag-handle"]
      ) {
        return this;
      }
      if (
        selector === "[data-whiteboard-drag-handle]" &&
        attributes["data-whiteboard-drag-handle"]
      ) {
        return this;
      }
      return null;
    },
    setPointerCapture: function () {}
  };
  listeners.pointerdown({
    target: target,
    clientX: 0,
    clientY: 0,
    pointerId: 1,
    preventDefault: function () {}
  });
  listeners.pointermove({
    clientX: dx,
    clientY: dy,
    preventDefault: function () {}
  });
  listeners.pointerup({});
}

function rightButtonPan(dx, dy) {
  var viewport = elementFor(".whiteboard-viewport");
  viewport.scrollLeft = 500;
  viewport.scrollTop = 400;
  var target = {
    closest: function (selector) {
      return selector === ".whiteboard-viewport" ? viewport : null;
    },
    setPointerCapture: function () {}
  };
  listeners.pointerdown({
    target: target,
    button: 2,
    clientX: 0,
    clientY: 0,
    pointerId: 2,
    preventDefault: function () {}
  });
  listeners.pointermove({
    clientX: dx,
    clientY: dy,
    preventDefault: function () {}
  });
  listeners.pointerup({});
  return viewport;
}

function wheelGesture(kind, deltaX, deltaY, options) {
  var selectorByKind = {
    sequence: ".sequence-board.view-horizontal",
    panorama: ".panorama-strip",
    whiteboard: ".whiteboard-viewport"
  };
  var elementSelector = {
    sequence: ".sequence-board",
    panorama: ".panorama-strip",
    whiteboard: ".whiteboard-viewport"
  }[kind];
  var viewport = elementFor(elementSelector);
  var selector = selectorByKind[kind];
  var prevented = false;
  var stopped = false;
  var target = {
    closest: function (query) {
      return query.indexOf(selector) >= 0 ? viewport : null;
    }
  };
  var event = Object.assign(
    {
      target: target,
      deltaX: deltaX,
      deltaY: deltaY,
      deltaMode: 0,
      ctrlKey: false,
      shiftKey: false,
      preventDefault: function () {
        prevented = true;
      },
      stopPropagation: function () {
        stopped = true;
      }
    },
    options || {}
  );
  listeners.wheel(event);
  return { viewport: viewport, prevented: prevented, stopped: stopped };
}

function marqueeGesture(startX, startY, endX, endY) {
  var canvas = elementFor(".whiteboard-canvas");
  var target = {
    closest: function (selector) {
      if (selector === ".whiteboard-canvas") return canvas;
      return null;
    },
    setPointerCapture: function () {}
  };
  listeners.pointerdown({
    target: target,
    button: 0,
    clientX: startX,
    clientY: startY,
    pointerId: 3,
    preventDefault: function () {}
  });
  listeners.pointermove({
    clientX: endX,
    clientY: endY,
    preventDefault: function () {}
  });
  listeners.pointerup({});
}

require(path.join(__dirname, "app.js"));

expectText("从已有照片开始", "首屏应提供从已有照片开始入口");
expectText("从核心问题开始", "首屏应提供从核心问题开始入口");
expectNoText("stage-navigation", "建立 Project 前不应显示 Contact Sheet 工作区导航");
click("choose-project-entry", { "data-mode": "question" });
expectText("建立一个 Project", "选择入口后应进入 Project 建立步骤");
listeners.input({
  target: {
    value: "河流向北",
    getAttribute: function (name) {
      return name === "data-role" ? "project-name" : null;
    }
  }
});
listeners.input({
  target: {
    value: "一段沿河行走的记忆，应该从哪里开始？",
    getAttribute: function (name) {
      return name === "data-role" ? "project-question" : null;
    }
  }
});
click("create-project");
expectText("1 Project", "建立后应解释 Project 与 Source 的关系");
expectText("还没有照片资料夹", "新 Project 应从空的 Source 列表开始");
expectText("Loading", "Source Hub 应解释 Loading 状态");
expectText("Partial", "Source Hub 应解释 Partial 状态");
expectText("Offline", "Source Hub 应解释 Offline 状态");
expectText("Permission Lost", "Source Hub 应解释 Permission Lost 状态");
click("add-demo-sources");
assert.equal(countText('<article class="source-card'), 2, "示例入口应添加两个独立 Source");
expectText("北岸散步", "第一个示例 Source 应保持独立名称");
expectText("南岸补拍", "第二个示例 Source 应保持独立名称");
click("set-source-status", {
  "data-id": "source-demo-2",
  "data-status": "offline"
});
expectText("资料夹目前离线", "Source 应能独立呈现 Offline 问题");
click("set-source-status", {
  "data-id": "source-demo-2",
  "data-status": "ready"
});
click("open-source", { "data-id": "source-demo" });
expectText("Contact Sheet", "点进单个 Source 后才应进入 Contact Sheet");
expectText("当前 Source · Ready", "Contact Sheet 应标明当前 Source 与状态");
expectText("Sequence + Pool", "顶部应显示合并后的 Sequence + Pool 阶段");
expectText("Compare", "顶部应显示 Compare 阶段");
expectNoText("当前意图", "应删除当前意图");
expectNoText("VISIBLE PROTOTYPE STATE", "应删除可见状态检查器");
expectNoText("Resume", "应删除恢复现场");
expectNoText("variant-switcher", "方案 B 胜出后不应保留方案切换器");
expectText("全选本页", "Contact Sheet 应提供全选功能");
expectText("反选本页", "Contact Sheet 应提供反选功能");

click("select-contact-page");
expectText("本次选择 12 张", "全选本页应选中当前页全部可用照片");
click("invert-contact-page");
expectText("本次选择 0 张", "反选本页应取消当前页全部已选照片");
assert.match(
  contactCardHtml("P02"),
  /contact-selection-surface[\s\S]*toggle-contact-photo[\s\S]*photo-preview-control[\s\S]*open-context-photo-preview/,
  "Contact Sheet 应把整图选择与预览按钮拆成独立控件"
);
assert.equal(listeners.dblclick, undefined, "意见7要求页面不再注册双击预览事件");
click("toggle-contact-photo", { "data-id": "P02" });
assert.match(contactCardOpeningTag("P02"), /is-selected/, "单击整张 Contact 照片应勾选");
click("open-context-photo-preview", { "data-context": "contact", "data-id": "P02" });
expectText("照片大图预览", "Contact Sheet 的预览按钮应打开大图预览");
expectText("2 / 12", "Contact Sheet 预览按钮应使用完整图库上下文");
expectText("操作 Contact 本次选择", "Contact 大图应说明选择作用范围");
expectText("✓ 已选择", "已选 Contact 照片的大图应反映选择状态");
click("preview-remove-photo");
expectText("选择照片", "大图中的移除按钮应取消 Contact 本次选择");
click("preview-select-photo");
expectText("✓ 已选择", "大图中的选择按钮应重新选择 Contact 照片");
click("preview-remove-photo");
click("close-photo-preview");

["P01", "P03", "P04", "P06", "P08"].forEach(function (id) {
  click("toggle-contact-photo", { "data-id": id });
});
click("add-to-pool");
expectText("Sequence + Pool", "加入 Pool 后应进入合并编辑器");
expectText("Pool <span>5", "Pool 应记录五张照片");
expectNoText('contact-photo is-selected', "进入 Pool 后不应保留 Contact Sheet 勾选状态");
assert.match(
  poolCardHtml("P03"),
  /pool-selection-surface[\s\S]*toggle-sequence-photo[\s\S]*photo-preview-control[\s\S]*open-context-photo-preview/,
  "Pool 应把整图选择与大图预览按钮拆成独立控件"
);
click("toggle-sequence-photo", { "data-id": "P03" });
expectText("Sequence <span>1", "单击整张 Pool 照片应加入 Sequence");
click("open-context-photo-preview", { "data-context": "pool", "data-id": "P03" });
expectText("照片大图预览", "Pool 的预览按钮应打开大图预览");
expectText("2 / 5", "Pool 预览按钮应使用 Pool 顺序");
expectText("操作当前 Sequence", "Pool 大图应说明选择作用于 Sequence");
expectText("✓ 已选择", "已入 Sequence 的 Pool 大图应反映选择状态");
click("preview-remove-photo");
expectText("Sequence <span>0", "Pool 大图的移除按钮应移出 Sequence");
click("preview-select-photo");
expectText("Sequence <span>1", "Pool 大图的选择按钮应重新加入 Sequence");
click("close-photo-preview");

click("goto-stage", { "data-stage": "contact" });
assert.match(
  contactCardOpeningTag("P01"),
  /is-in-pool/,
  "已在 Pool 的照片应显示灰阶状态"
);

click("goto-stage", { "data-stage": "sequence" });
click("remove-pool-photo", { "data-id": "P08" });
click("goto-stage", { "data-stage": "contact" });
assert.doesNotMatch(
  contactCardOpeningTag("P08"),
  /is-in-pool/,
  "从 Pool 删除后 Contact Sheet 应恢复普通彩色状态"
);
assert.match(
  contactCardHtml("P08"),
  /toggle-contact-photo/,
  "从 Pool 删除后照片应可再次选择"
);

click("goto-stage", { "data-stage": "sequence" });
click("select-all-pool");
expectText("Sequence <span>4", "Pool 全选应把全部候选加入 Sequence");
click("invert-pool-selection");
expectText("Sequence <span>0", "Pool 反选应反转与 Sequence 的对应关系");
["P01", "P03", "P04"].forEach(function (id) {
  click("toggle-sequence-photo", { "data-id": id });
});
expectText("Sequence <span>3", "勾选 Pool 照片应同步加入 Sequence");
click("toggle-sequence-photo", { "data-id": "P03" });
expectText("Sequence <span>2", "反选 Pool 照片应同步移出 Sequence");
click("toggle-sequence-photo", { "data-id": "P03" });
click("toggle-sequence-photo", { "data-id": "P06" });
expectText("Sequence <span>4", "Sequence 不应限制为固定张数");
expectText(
  "sequence-board view-horizontal",
  "Sequence 默认应使用横向单排视角"
);
expectText("横向滚动", "横向视角应显示滚动条辅助按钮");
expectNoText("直接布置工作区", "意见7要求删除独立的直接布置工作区模块");
expectNoText("拖动 Sequence", "意见7要求删除 Sequence 模块拖动把手和说明");
expectText("拖动 Pool", "Pool 模块应提供直接拖动把手");
expectText("进入白板", "Sequence 应提供白板入口");
expectText("进入序列全景", "Sequence 应提供序列全景入口");
assert.match(
  appNode.innerHTML,
  /<header class="column-heading">[\s\S]*sequence-mode-actions[\s\S]*进入白板[\s\S]*进入序列全景[\s\S]*<\/header>/,
  "白板与序列全景入口应位于 Sequence 标题右侧"
);
expectText("保存首个版本", "收紧后的 Sequence 首屏应保留保存入口");
expectNoText("模块布局设置", "应删除旧的布局滑杆面板");
expectNoText("调整模块", "应删除旧的调整模块按钮");
expectNoText("photo-size-controls", "应删除照片底部的加减尺寸控件");
expectNoText("rotate-photo", "改动意见 6 要求删除照片旋转功能");

click("select-all-sequence");
expectText("Sequence 选择 4 张", "Sequence 全选应选择全部序列照片");
click("invert-sequence-selection");
expectText("Sequence 选择 0 张", "Sequence 反选应反转批量选择");

elementFor(".pool-column").scrollTop = 275;
elementFor(".sequence-board").scrollLeft = 720;
click("toggle-sequence-photo", { "data-id": "P04" });
assert.equal(
  elementFor(".pool-column").scrollTop,
  275,
  "从 Pool 反选照片后应保留原滚动位置"
);
assert.equal(
  elementFor(".sequence-board").scrollLeft,
  720,
  "从 Sequence 移除照片后应保留横向滚动位置"
);
click("toggle-sequence-photo", { "data-id": "P04" });
assert.equal(
  elementFor(".pool-column").scrollTop,
  275,
  "从 Pool 选择照片后应保留原滚动位置"
);
click("scroll-sequence", { "data-direction": "1" });
assert.equal(scrollCalls.length, 1, "右箭头应触发一次横向滚动");
assert.equal(scrollCalls[0].left, 360, "右箭头应向右滚动");
click("set-sequence-view", { "data-view": "grid" });
expectText("sequence-board view-grid", "用户应能切换到网格视角");
expectNoText("横向滚动", "网格视角不应显示横向滚动按钮");
click("set-sequence-view", { "data-view": "horizontal" });
assert.equal(typeof listeners.wheel, "function", "应注册 wheel 接管逻辑");
var sequenceWheel = wheelGesture("sequence", 80, 5);
assert.equal(
  sequenceWheel.prevented,
  true,
  "Sequence 横向 wheel 应阻止浏览器默认导航"
);
assert.equal(
  sequenceWheel.stopped,
  true,
  "Sequence 横向 wheel 应阻止事件继续冒泡"
);
assert.equal(
  sequenceWheel.viewport.scrollLeft,
  800,
  "Sequence 横向 wheel 应由图库容器接管并移动 scrollLeft"
);
var sequenceVerticalWheel = wheelGesture("sequence", 5, 80);
assert.equal(
  sequenceVerticalWheel.prevented,
  false,
  "Sequence 垂直 wheel 不应被横向接管逻辑误伤"
);

drag("P06", "P01");
var p06Position = appNode.innerHTML.indexOf('data-drag-id="P06"');
var p01Position = appNode.innerHTML.indexOf('data-drag-id="P01"');
var p04Position = appNode.innerHTML.indexOf('data-drag-id="P04"');
assert.ok(
  p06Position < p01Position && p01Position < p04Position,
  "拖曳后 Sequence 顺序应改变"
);

pointerGesture(
  {
    "data-resize-kind": "module",
    "data-id": "pool",
    "data-corner": "sw"
  },
  -120,
  80
);
expectText("--module-width:34%", "向左拖动 Pool 左下角应扩大模块宽度");
expectText("--module-height:650px", "向下拖动 Pool 左下角应扩大模块高度");

pointerGesture(
  {
    "data-resize-kind": "sequence-photo",
    "data-id": "P01",
    "data-corner": "se"
  },
  60,
  60
);
expectText(
  "--sequence-photo-size:250px",
  "拖动照片右下角应直接放大单张 Sequence 照片"
);
expectText(
  "--sequence-frame-height:290px",
  "调整单张照片不应改变横向画布高度"
);
click("open-sequence-panorama");
expectText("sequence-panorama-mode", "Sequence 应进入只显示照片序列的全景模式");
expectText("Sequence 序列全景", "全景模式应标明来源");
assert.equal(countText('class="panorama-item"'), 4, "全景模式应呈现完整 Sequence");
expectText("--panorama-size:313px", "全景照片应为 Sequence 卡片尺寸的 1.25 倍");
elementFor(".panorama-strip").scrollLeft = 200;
var panoramaWheel = wheelGesture("panorama", -120, 4);
assert.equal(
  panoramaWheel.prevented,
  true,
  "序列全景横向 wheel 应阻止浏览器默认导航"
);
assert.equal(
  panoramaWheel.viewport.scrollLeft,
  80,
  "序列全景横向 wheel 应由全景容器接管"
);
click("open-panorama-photo", { "data-id": "P06" });
expectText("照片大图预览", "全景模式点击照片应打开大图预览");
expectText("1 / 4", "大图预览应显示当前照片在序列中的位置");
expectText("操作当前 Sequence", "Sequence 大图应提供当前序列的选择与移除操作");
expectText("✓ 已选择", "Sequence 中的照片在大图里应显示为已选择");
click("step-photo-preview", { "data-direction": "1" });
expectText("河岸 01", "大图预览右箭头应进入下一张序列照片");
listeners.keydown({
  key: "ArrowRight",
  target: { tagName: "BODY", isContentEditable: false },
  preventDefault: function () {}
});
expectText("归途 03", "键盘右键应继续按 Sequence 顺序浏览");
listeners.keydown({
  key: "Escape",
  target: { tagName: "BODY", isContentEditable: false }
});
expectNoText("照片大图预览", "Escape 应关闭大图预览");
expectText("sequence-panorama-mode", "关闭单张大图后应返回序列全景");
click("close-sequence-panorama");
expectText("保存首个版本", "退出序列全景应回到可见保存入口的 Sequence 工作区");

click("toggle-whiteboard");
expectText("whiteboard-mode", "进入白板后应呈现自由二维画布");
expectText("保留排序退出", "白板应提供保留排序出口");
expectText("放弃改动退出", "白板应提供不保留排序出口");
expectText("框选多张", "白板应提示框选与多照片移动能力");
expectText("75%", "白板默认应以 75% 视角展示大画布");
expectText("width:5200px;height:3600px", "白板应扩大到可容纳 50 张以上照片");
expectText("data-resize-kind=\"whiteboard-photo\"", "白板照片应提供四角缩放");
expectText("remove-whiteboard-photo", "白板内应提供单张照片移除功能");
expectNoText("whiteboard-photo-name", "白板照片应移除照片名等附加信息");
expectNoText("whiteboard-rotate", "白板应彻底移除旋转功能");
expectNoText('class="app-header"', "白板不应显示普通页面头部");
expectNoText('class="pool-column"', "白板不应显示 Pool");

var whiteboardWheel = wheelGesture("whiteboard", 120, 90);
assert.equal(
  whiteboardWheel.prevented,
  true,
  "白板 wheel 应阻止浏览器默认导航"
);
assert.equal(
  whiteboardWheel.viewport.scrollLeft,
  120,
  "白板横向 wheel 应平移白板视角"
);
assert.equal(
  whiteboardWheel.viewport.scrollTop,
  90,
  "白板纵向 wheel 应平移白板视角"
);

click("zoom-whiteboard", { "data-direction": "1" });
expectText("100%", "白板应支持放大视角");
var pannedViewport = rightButtonPan(120, 80);
assert.equal(pannedViewport.scrollLeft, 380, "按住右键向右拖应平移白板视角");
assert.equal(pannedViewport.scrollTop, 320, "按住右键向下拖应平移白板视角");

marqueeGesture(100, 100, 600, 500);
expectText("已选 2 张", "框选区域应选择相交的两张白板照片");
pointerGesture({ "data-whiteboard-drag-handle": "P06" }, 100, 40);
expectText("left:220px;top:190px", "拖动选中照片时第一张应移动");
expectText("left:470px;top:190px", "拖动选中照片时第二张应作为一组移动");
click("remove-whiteboard-selection");
expectText("Sequence 白板</strong> · 2 张", "白板应能批量移除框选照片");
click("exit-whiteboard-discard");
expectText("Sequence <span>4", "放弃白板改动应恢复进入前的照片与顺序");
expectText("已放弃本次白板", "放弃退出应给出明确反馈");

click("select-all-sequence");
click("invert-sequence-selection");
click("toggle-whiteboard");

pointerGesture({ "data-whiteboard-drag-handle": "P01" }, -340, 0);
var whiteboardP01 = appNode.innerHTML.indexOf('data-whiteboard-item="P01"');
var whiteboardP06 = appNode.innerHTML.indexOf('data-whiteboard-item="P06"');
assert.ok(
  whiteboardP01 < whiteboardP06,
  "在白板中将 P01 拖到最左侧后应成为第一张"
);
pointerGesture(
  {
    "data-resize-kind": "whiteboard-photo",
    "data-id": "P01",
    "data-corner": "se"
  },
  50,
  40
);
expectText("width:250px;height:320px", "白板照片应能通过角点自由改变宽高");
click("exit-whiteboard-save");
expectText("保存首个版本", "退出白板应返回可见保存入口的 Sequence 工作区");
var persistedP01 = appNode.innerHTML.indexOf('data-drag-id="P01"');
var persistedP06 = appNode.innerHTML.indexOf('data-drag-id="P06"');
assert.ok(
  persistedP01 < persistedP06,
  "白板中的位置排序应在退出后保留到 Sequence"
);

listeners.input({
  target: {
    value: "安静开头",
    getAttribute: function (name) {
      return name === "data-role" ? "version-name" : null;
    }
  }
});
click("save-version");
expectText("安静开头 已保存", "首个命名版本应保存成功");
click("toggle-sequence-photo", { "data-id": "P03" });
listeners.input({
  target: {
    value: "人物先行",
    getAttribute: function (name) {
      return name === "data-role" ? "version-name" : null;
    }
  }
});
click("save-version");
expectText("选择两个版本", "第二次保存后应进入精简 Compare");
assert.equal(countText('class="compare-row'), 2, "Compare 应只显示两个版本");
assert.equal(
  countText('data-action="toggle-compare-version"'),
  2,
  "Compare 标题右侧应显示全部已保存版本包"
);
expectText("安静开头", "版本包和版本模块应显示自定义名称");
expectText("人物先行", "第二个版本应保留自定义名称");
expectText("选择两个版本", "Compare 应明确要求直接选择两个版本");
assert.equal(
  countText('aria-pressed="true"'),
  2,
  "保存第二个版本后应默认选择两个版本进行比较"
);
expectNoText("星标", "Compare 不应再使用星标比较基准");
expectNoText("设为喜欢的版本", "Compare 不应再显示喜欢版本按钮");
expectText("Memo", "两个版本旁边应提供 Memo");
expectNoText("Added", "Compare 不应显示差异数据");
expectNoText("Moved", "Compare 不应显示差异数据");
expectNoText("Removed", "Compare 不应显示差异数据");
expectText(
  "打开版本，返回 Sequence 继续排序",
  "Compare 应保留独立的返回 Sequence 编辑按钮"
);

click("open-version-preview", { "data-id": "v1" });
expectText("sequence-panorama-mode", "点击版本模块应进入序列全景");
expectText("Compare 版本序列全景", "Compare 全景应标明版本来源");
expectText("安静开头", "沉浸预览应保留版本名称");
assert.equal(countText('class="panorama-item"'), 4, "Compare 全景应呈现版本的完整序列");
click("open-panorama-photo", { "data-id": "P01" });
expectText("照片大图预览", "Compare 全景点击照片应进入完整大图");
expectText("1 / 4", "Compare 大图应使用版本而非当前工作副本的顺序");
expectText("已保存版本只读", "Compare 大图应明确历史版本不会被直接修改");
assert.match(
  appNode.innerHTML,
  /data-action="preview-select-photo" disabled[\s\S]*data-action="preview-remove-photo" disabled/,
  "Compare 大图仍显示选择与移除按钮，但必须保持只读"
);
listeners.keydown({
  key: "Escape",
  target: { tagName: "BODY", isContentEditable: false }
});
expectText("sequence-panorama-mode", "关闭 Compare 大图应返回版本全景");
listeners.keydown({
  key: "Escape",
  target: { tagName: "BODY", isContentEditable: false }
});
expectNoText("sequence-panorama-mode", "再次按 Escape 应退出版本全景");
expectText("Compare", "退出沉浸预览应返回 Compare");

listeners.input({
  target: {
    value: "这个开头更安静，进入河岸更自然。",
    getAttribute: function (name) {
      if (name === "data-role") return "version-memo";
      if (name === "data-version-id") return "v1";
      return null;
    }
  }
});
click("toggle-compare-version", { "data-id": "v2" });
click("toggle-compare-version", { "data-id": "v2" });
expectText("这个开头更安静", "Memo 应在内存状态中保留");
expectText("人物先行", "已选择的第二个版本应继续显示");

click("edit-version", { "data-id": "v1" });
expectText("工作副本来自 V1", "点击版本应回到 Sequence 排序界面");
listeners.input({
  target: {
    value: "回到河岸",
    getAttribute: function (name) {
      return name === "data-role" ? "version-name" : null;
    }
  }
});
click("save-version");
assert.equal(countText('class="compare-row'), 2, "再次保存仍只能显示两个版本");
assert.equal(
  countText('data-action="toggle-compare-version"'),
  3,
  "三个已保存版本都应成为可点击版本包"
);
assert.match(compareStackHtml(), /安静开头/, "保存新版本后应保留旧比较版本");
assert.match(compareStackHtml(), /回到河岸/, "工作副本保存后应以自定义名称参与比较");
assert.doesNotMatch(compareStackHtml(), /人物先行/, "未选中的旧版本不应占用两个放大比较位");

click("toggle-compare-version", { "data-id": "v1" });
click("toggle-compare-version", { "data-id": "v2" });
assert.match(compareStackHtml(), /人物先行/, "用户选择的第二个版本应进入比较");
assert.match(compareStackHtml(), /回到河岸/, "用户选择的新版本应继续参与比较");
assert.doesNotMatch(compareStackHtml(), /安静开头/, "取消选择的版本不应继续出现在比较区");
expectNoText("星标", "版本数量增加后仍不应恢复星标逻辑");

var localFiles = Array.from({ length: 1205 }, function (_value, index) {
  var number = index + 1;
  return {
    name: "photo-" + number + ".jpg",
    type: "image/jpeg",
    size: 1024 * 1024,
    webkitRelativePath: "ux05-set/photo-" + number + ".jpg"
  };
});
click("open-source-hub");
expectText("北岸散步", "返回 Project 后应保留已有 Source");
listeners.change({
  target: {
    files: localFiles,
    value: "folder",
    getAttribute: function (name) {
      return name === "data-role" ? "source-folder" : null;
    }
  }
});
expectText("ux05-set", "新 Source 应独立显示本地文件夹名称");
expectText("1200 / 1205 张", "超过研究上限的 Source 应显示已读取数与总数");
expectText("Partial", "只读取前 1200 张时应显示 Partial 状态");
expectText("已经可以开始选片", "Partial Source 应提供非阻塞下一步出口");
click("open-source", { "data-id": "source-local-1" });
expectText("图库 1200 张", "本地研究图库应最多读取 1200 张 JPEG");
expectText("第 1 / 20 页", "1200 张图库应分页而不是一次渲染全部照片");
assert.equal(
  countText('data-photo-id="'),
  60,
  "Contact Sheet 每次只应渲染 60 张以降低 DOM 与解码压力"
);
expectText("Slocal-1-P0060", "第一页应渲染到第 60 张 JPEG");
expectNoText("Slocal-1-P0061", "第一页不应渲染下一页 JPEG");
assert.equal(objectUrlCalls, 1200, "导入应为 1200 张 JPEG 分别建立 Object URL");
click("open-context-photo-preview", { "data-context": "contact", "data-id": "Slocal-1-P0001" });
expectText("1 / 1200", "本地 JPEG 应能从 Contact Sheet 进入完整图库预览");
expectText('src="blob:local-photo-1"', "本地 JPEG 大图预览应复用原始 Object URL");
expectText('draggable="false"', "本地大图应使用独立的完整图片元素");
click("close-photo-preview");
click("change-contact-page", { "data-direction": "1" });
expectText("第 2 / 20 页", "分页按钮应进入下一批照片");
expectText("Slocal-1-P0061", "第二页应从第 61 张 JPEG 开始");
expectNoText('data-photo-id="Slocal-1-P0001"', "翻页后不应继续保留第一页照片 DOM");
click("change-contact-page", { "data-direction": "-1" });

click("toggle-contact-photo", { "data-id": "Slocal-1-P0001" });
click("add-to-pool");
expectText("ux05-set", "Pool 照片应标记所属的新 Source");
expectText("北岸散步", "Pool 应同时保留先前 Source 的照片");
click("open-source-hub");
click("open-source", { "data-id": "source-demo" });
click("goto-stage", { "data-stage": "sequence" });
expectText("Pool <span>5 / 60", "切换 Source 后 Project Pool 不应清空");
expectText("ux05-set", "切回旧 Source 后仍应看到新 Source 的 Pool 照片");
click("open-source-hub");
click("open-source", { "data-id": "source-local-1" });
click("reset");
expectText("Pool 0 / 60", "清空本轮编辑后应保留当前 Source 但清空 Pool");
click("select-contact-page");
expectText("本次选择 60 张", "全选本页应遵守 Pool 的 60 张上限");
click("toggle-contact-photo", { "data-id": "Slocal-1-P0061" });
expectText("Pool 上限是 60 张", "第 61 张候选应被 Pool 上限拦截");
click("add-to-pool");
expectText("Pool <span>60 / 60", "Pool 应支持并限制为 60 张照片");

click("select-all-pool");
expectText("Sequence <span>60", "Sequence 应能承载完整的 60 张 Pool");
click("toggle-whiteboard");
assert.equal(
  countText('class="whiteboard-item"'),
  60,
  "大白板应同时呈现 60 张照片"
);
expectText("width:5200px;height:3600px", "50 张照片应使用扩大的白板画布");
click("exit-whiteboard-discard");
click("reset");
expectText("Contact Sheet", "重新开始应返回空白 Contact Sheet");
expectText("Pool 0 / 60", "重新开始应清空 Pool");
expectText("图库 1200 张", "重新开始应保留 Project 当前 Source");

var styles = fs.readFileSync(path.join(__dirname, "styles.css"), "utf8");
assert.match(styles, /\.project-entry-grid\s*\{/, "Project 首屏应存在两个入口布局");
assert.match(styles, /\.source-grid\s*\{/, "Project Hub 应存在独立 Source 卡片布局");
assert.match(styles, /\.relationship-strip\s*\{/, "Project、Source、Contact Sheet 关系应可视化");
var previewImageRule = styles.match(/\.preview-photo\.is-local img\s*\{([^}]*)\}/);
assert.ok(previewImageRule, "应存在本地照片大图样式");
assert.match(
  previewImageRule[1],
  /width:\s*auto[\s\S]*height:\s*auto[\s\S]*max-height:\s*calc\(var\(--preview-dialog-height\)[\s\S]*object-fit:\s*contain/,
  "本地竖图、横图和特殊比例都应在大图预览中完整显示"
);
assert.match(
  previewImageRule[1],
  /image-orientation:\s*from-image/,
  "含 EXIF 方向信息的竖幅 JPEG 应按拍摄方向完整显示"
);
assert.doesNotMatch(
  previewImageRule[1],
  /(^|\n)\s*(?:width|height):\s*100%/,
  "大图图片元素不应再被强制同时撑满容器宽高"
);
assert.doesNotMatch(styles, /photo-rotation|rotate-photo|whiteboard-rotate/, "旋转样式应彻底删除");
var horizontalRule = styles.match(/\.sequence-board\.view-horizontal\s*\{([^}]*)\}/);
assert.ok(horizontalRule, "横向 Sequence 应存在独立滚动样式");
assert.match(horizontalRule[1], /touch-action:\s*pan-x\s+pinch-zoom/, "横向 Sequence 应声明横向触控意图");
assert.match(horizontalRule[1], /overscroll-behavior-x:\s*none/, "横向 Sequence 不应把边界手势传给页面导航");
var panoramaRule = styles.match(/\.panorama-strip\s*\{([^}]*)\}/);
assert.ok(panoramaRule, "序列全景应存在独立滚动样式");
assert.match(panoramaRule[1], /touch-action:\s*pan-x\s+pinch-zoom/, "序列全景应声明横向触控意图");
assert.match(panoramaRule[1], /overscroll-behavior-x:\s*none/, "序列全景不应把边界手势传给页面导航");
var whiteboardRule = styles.match(/\.whiteboard-viewport\s*\{([^}]*)\}/);
assert.ok(whiteboardRule, "白板应存在独立滚动视口样式");
assert.match(whiteboardRule[1], /touch-action:\s*none/, "白板应接管触摸与指针手势");
assert.match(whiteboardRule[1], /overscroll-behavior:\s*none/, "白板不应把 wheel 边界手势传给页面导航");

process.stdout.write(
  "PhotoFlex prototype feedback-10 test passed: project-first onboarding, independent multi-source states, cross-source Pool retention, paged 1200-photo import, whole-photo selection with preview-only buttons, sequence/Compare panoramas, whiteboard group editing, direct two-version Compare selection, wheel-owned navigation, and stable removal scroll.\n"
);
