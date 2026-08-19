"use strict";

var assert = require("node:assert/strict");
var path = require("node:path");

var appNode = { innerHTML: "" };
var listeners = {};
var scrollCalls = [];
var mockElements = {};

function createMockElement(selector) {
  return {
    selector: selector,
    scrollTop: 0,
    scrollLeft: 0,
    style: {
      values: {},
      setProperty: function (name, value) {
        this.values[name] = value;
      }
    },
    getBoundingClientRect: function () {
      return { width: 1200, height: 700 };
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
      selector.indexOf('[data-module="') === 0 ||
      selector.indexOf('[data-drag-id="') === 0 ||
      selector.indexOf('[data-whiteboard-item="') === 0
    ) {
      return elementFor(selector);
    }
    return null;
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
  return appNode.innerHTML.lastIndexOf('<button class="contact-photo', idPosition);
}

function contactCardOpeningTag(id) {
  var start = contactCardStart(id);
  var end = appNode.innerHTML.indexOf(">", start);
  return appNode.innerHTML.slice(start, end + 1);
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

require(path.join(__dirname, "app.js"));

expectText("Contact Sheet", "初始阶段应为 Contact Sheet");
expectText("Sequence + Pool", "顶部应显示合并后的 Sequence + Pool 阶段");
expectText("Compare", "顶部应显示 Compare 阶段");
expectNoText("当前意图", "应删除当前意图");
expectNoText("VISIBLE PROTOTYPE STATE", "应删除可见状态检查器");
expectNoText("Resume", "应删除恢复现场");
expectNoText("variant-switcher", "方案 B 胜出后不应保留方案切换器");

["P01", "P03", "P04", "P06", "P08"].forEach(function (id) {
  click("toggle-contact-photo", { "data-id": id });
});
click("add-to-pool");
expectText("Sequence + Pool", "加入 Pool 后应进入合并编辑器");
expectText("Pool <span>5", "Pool 应记录五张照片");
expectNoText('contact-photo is-selected', "进入 Pool 后不应保留 Contact Sheet 勾选状态");

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
  contactCardOpeningTag("P08"),
  /toggle-contact-photo/,
  "从 Pool 删除后照片应可再次选择"
);

click("goto-stage", { "data-stage": "sequence" });
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
expectText("直接布置工作区", "工作区应说明模块采用直接拖动与角点缩放");
expectText("拖动 Sequence", "Sequence 模块应提供直接拖动把手");
expectText("拖动 Pool", "Pool 模块应提供直接拖动把手");
expectText("进入白板", "Sequence 应提供白板入口");
expectNoText("模块布局设置", "应删除旧的布局滑杆面板");
expectNoText("调整模块", "应删除旧的调整模块按钮");
expectNoText("photo-size-controls", "应删除照片底部的加减尺寸控件");

elementFor(".pool-column").scrollTop = 275;
click("toggle-sequence-photo", { "data-id": "P04" });
assert.equal(
  elementFor(".pool-column").scrollTop,
  275,
  "从 Pool 反选照片后应保留原滚动位置"
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

drag("P06", "P01");
var p06Position = appNode.innerHTML.indexOf('data-drag-id="P06"');
var p01Position = appNode.innerHTML.indexOf('data-drag-id="P01"');
var p04Position = appNode.innerHTML.indexOf('data-drag-id="P04"');
assert.ok(
  p06Position < p01Position && p01Position < p04Position,
  "拖曳后 Sequence 顺序应改变"
);

pointerGesture({ "data-module-drag-handle": "sequence" }, 120, 40);
expectText("--module-x:10%", "拖动 Sequence 模块应直接更新横向位置");
expectText("--module-y:40px", "拖动 Sequence 模块应直接更新纵向位置");
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
expectText("--module-height:680px", "向下拖动 Pool 左下角应扩大模块高度");

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
  "--sequence-frame-height:350px",
  "调整单张照片不应改变横向画布高度"
);
click("rotate-photo", { "data-id": "P01" });
expectText("--photo-rotation:90deg", "照片旋转按钮应顺时针旋转 90 度");

click("open-photo-preview", { "data-id": "P06" });
expectText("照片大图预览", "点击 Sequence 照片应打开大图预览");
expectText("1 / 4", "大图预览应显示当前照片在序列中的位置");
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

click("toggle-whiteboard");
expectText("whiteboard-mode", "进入白板后应呈现自由二维画布");
expectText("退出白板并保留排序", "白板应说明退出时会保留排序");
expectText("data-resize-kind=\"whiteboard-photo\"", "白板照片应提供四角缩放");
expectNoText('class="app-header"', "白板不应显示普通页面头部");
expectNoText('class="pool-column"', "白板不应显示 Pool");

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
click("rotate-photo", { "data-id": "P01" });
expectText("--photo-rotation:180deg", "白板中的旋转应沿用同一照片状态");
click("toggle-whiteboard");
expectText("直接布置工作区", "退出白板应返回 Sequence 工作区");
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
expectText("安静开头 已保存并自动打星", "首个命名版本应自动成为星标基准");
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
expectText("画面只保留两个版本", "第二次保存后应进入精简 Compare");
assert.equal(countText('class="compare-row'), 2, "Compare 应只显示两个版本");
assert.equal(
  countText('data-action="select-compare-version"'),
  2,
  "Compare 标题右侧应显示全部已保存版本包"
);
expectText("安静开头", "版本包和版本模块应显示自定义名称");
expectText("人物先行", "第二个版本应保留自定义名称");
expectText("★ 已设为比较基准", "星标版本应清楚标记");
expectText("Memo", "两个版本旁边应提供 Memo");
expectNoText("Added", "Compare 不应显示差异数据");
expectNoText("Moved", "Compare 不应显示差异数据");
expectNoText("Removed", "Compare 不应显示差异数据");

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
click("star-version", { "data-id": "v2" });
expectText("这个开头更安静", "Memo 应在内存状态中保留");
expectText("人物先行", "新的星标版本应继续显示");

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
  countText('data-action="select-compare-version"'),
  3,
  "三个已保存版本都应成为可点击版本包"
);
assert.match(
  compareStackHtml(),
  /人物先行/,
  "比较应始终包含当前星标版本"
);
assert.match(
  compareStackHtml(),
  /回到河岸/,
  "工作副本保存后应以自定义名称参与比较"
);
assert.doesNotMatch(
  compareStackHtml(),
  /安静开头/,
  "未选中的旧版本不应占用两个放大比较位"
);

click("select-compare-version", { "data-id": "v1" });
assert.match(
  compareStackHtml(),
  /人物先行/,
  "点击版本包后仍应保留星标版本"
);
assert.match(
  compareStackHtml(),
  /安静开头/,
  "点击版本包应将该版本切换为比较对象"
);
assert.doesNotMatch(
  compareStackHtml(),
  /回到河岸/,
  "切换后旧比较对象应退出两个放大比较位"
);

process.stdout.write(
  "PhotoFlex prototype feedback-4 test passed: direct module drag/corner resize, preserved Pool scroll, photo rotation, corner-resized Sequence cards, free whiteboard layout, and whiteboard order persisted back to Sequence, plus all previous version flows.\n"
);
