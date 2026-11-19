import fs from "node:fs/promises";

const baseUrl = process.env.BASE_URL || "http://127.0.0.1:8094/";
const cdpBase = process.env.CDP_BASE || "http://127.0.0.1:9224";
const outputDir = new URL("./artifacts/", import.meta.url);
await fs.mkdir(outputDir, { recursive: true });

const pages = await (await fetch(`${cdpBase}/json/list`)).json();
const page = pages.find((item) => item.type === "page");
if (!page) {
  throw new Error("No browser page found");
}

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

let nextId = 1;
const pending = new Map();
const diagnostics = {
  consoleErrors: [],
  exceptions: [],
  logErrors: [],
  failedRequests: []
};

socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const item = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) {
      item.reject(new Error(message.error.message));
    } else {
      item.resolve(message.result);
    }
    return;
  }
  if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
    diagnostics.consoleErrors.push(
      message.params.args.map((arg) => arg.value ?? arg.description ?? "").join(" ")
    );
  }
  if (message.method === "Runtime.exceptionThrown") {
    diagnostics.exceptions.push(message.params.exceptionDetails.text);
  }
  if (message.method === "Log.entryAdded" && message.params.entry.level === "error") {
    diagnostics.logErrors.push(message.params.entry.text);
  }
  if (message.method === "Network.loadingFailed" && !message.params.canceled) {
    diagnostics.failedRequests.push(message.params.errorText);
  }
});

function send(method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression) {
  const response = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true
  });
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.text);
  }
  return response.result?.value;
}

async function waitFor(expression, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}

async function setViewport(width, height, mobile = false) {
  await send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile,
    screenWidth: width,
    screenHeight: height
  });
}

async function navigate() {
  await send("Page.navigate", { url: baseUrl });
  await waitFor("document.readyState === 'complete'");
  await waitFor("document.querySelectorAll('.algorithm-tab').length === 6");
  await waitFor("document.querySelectorAll('.route-arrow').length > 0");
  await new Promise((resolve) => setTimeout(resolve, 250));
}

async function screenshot(fileName, fullPage = false) {
  const result = await send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: fullPage
  });
  await fs.writeFile(new URL(fileName, outputDir), Buffer.from(result.data, "base64"));
}

async function inspectLayout(label) {
  return evaluate(`(() => {
    const stage = document.getElementById("chartStage");
    const svg = document.getElementById("diskChart");
    const stageRect = stage.getBoundingClientRect();
    const svgRect = svg.getBoundingClientRect();
    const arrows = [...document.querySelectorAll(".route-arrow")];
    const nodes = [...document.querySelectorAll(".node-index")];
    const viewportWidth = document.documentElement.clientWidth;
    return {
      label: ${JSON.stringify(label)},
      viewportWidth,
      pageScrollWidth: document.documentElement.scrollWidth,
      horizontalOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - viewportWidth,
      stageClientWidth: stage.clientWidth,
      stageScrollWidth: stage.scrollWidth,
      stageHorizontalOverflow: stage.scrollWidth - stage.clientWidth,
      stageHeight: Math.round(stageRect.height),
      svgWidth: Math.round(svgRect.width),
      svgRightWithinStage: svgRect.right <= stageRect.right + 1,
      svgViewBox: svg.getAttribute("viewBox"),
      arrowCount: arrows.length,
      arrowsHavePoints: arrows.every((arrow) => (arrow.getAttribute("points") || "").trim().length > 8),
      nodeCount: nodes.length,
      nodeLabels: nodes.map((node) => node.textContent.trim()),
      activeAlgorithm: document.querySelector(".algorithm-tab.active .code")?.textContent.trim(),
      total: document.getElementById("metricTotal").textContent.trim(),
      stepReadout: document.getElementById("stepReadout").textContent.trim(),
      parameterBrief: document.getElementById("parameterBrief").textContent.trim()
    };
  })()`);
}

await send("Page.enable");
await send("Runtime.enable");
await send("Log.enable");
await send("Network.enable");

await setViewport(1440, 1000, false);
await navigate();
const desktop = await inspectLayout("desktop");
await screenshot("desktop-overview.png");

await evaluate(`document.getElementById("editParamsButton").click()`);
await waitFor("document.activeElement && document.activeElement.id === 'requests'");
const editFocus = await evaluate(`(() => ({
  activeElement: document.activeElement.id,
  selectedText: document.getElementById("requests").value.slice(
    document.getElementById("requests").selectionStart,
    document.getElementById("requests").selectionEnd
  )
}))()`);

await evaluate(`document.getElementById("chartStage").scrollIntoView({ block: "center" })`);
await new Promise((resolve) => setTimeout(resolve, 250));
await screenshot("desktop-chart.png");

await evaluate(`(() => {
  document.querySelector('[data-code="C-SCAN"]').click();
  const slider = document.getElementById("stepSlider");
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
  setter.call(slider, "4");
  slider.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
})()`);
await waitFor("document.getElementById('stepReadout').textContent.trim() === '4 / 10'");
const playback = await inspectLayout("desktop-c-scan-step-4");
await screenshot("desktop-c-scan-step-4.png");

const mobileChecks = [];
for (const width of [390, 360]) {
  await setViewport(width, 844, true);
  await navigate();
  mobileChecks.push(await inspectLayout(`mobile-${width}`));
}

await setViewport(390, 844, true);
await navigate();
await screenshot("mobile-overview.png");
await evaluate(`document.getElementById("chartStage").scrollIntoView({ block: "center" })`);
await new Promise((resolve) => setTimeout(resolve, 250));
await screenshot("mobile-chart.png");

const report = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  desktop,
  editFocus,
  playback,
  mobileChecks,
  diagnostics
};

await fs.writeFile(new URL("ui-qa.json", outputDir), JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify(report, null, 2));
socket.close();
