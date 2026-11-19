(function startApplication() {
  "use strict";

  var STORAGE_KEY = "disk-scheduling-lab-recent-v2";
  var SVG_NS = "http://www.w3.org/2000/svg";
  var MAX_REQUESTS = 256;
  var scheduling = window.DiskScheduling;

  var presets = {
    classroom: {
      requests: "76, 147, 42, 131, 23, 135, 59, 61",
      head: 48,
      maxTrack: 199,
      direction: "up"
    },
    backforth: {
      requests: "55, 58, 39, 18, 90, 160, 150, 38, 184",
      head: 100,
      maxTrack: 199,
      direction: "up"
    },
    edge: {
      requests: "0, 5, 10, 190, 195, 199, 100, 101, 99",
      head: 50,
      maxTrack: 199,
      direction: "down"
    }
  };

  var state = {
    data: null,
    selected: "SSTF",
    step: 0,
    playing: false,
    timer: null,
    speed: 620,
    direction: "up",
    recent: loadRecent(),
    lastChartWidth: 0
  };

  var elements = {
    form: document.getElementById("scheduleForm"),
    requests: document.getElementById("requests"),
    head: document.getElementById("head"),
    maxTrack: document.getElementById("maxTrack"),
    directionControl: document.getElementById("directionControl"),
    inputCount: document.getElementById("inputCount"),
    presetList: document.getElementById("presetList"),
    runButton: document.getElementById("runButton"),
    messageBar: document.getElementById("messageBar"),
    algorithmTabs: document.getElementById("algorithmTabs"),
    chartStage: document.getElementById("chartStage"),
    chart: document.getElementById("diskChart"),
    chartAlgorithm: document.getElementById("chartAlgorithm"),
    directionTag: document.getElementById("directionTag"),
    metricAlgorithm: document.getElementById("metricAlgorithm"),
    metricTotal: document.getElementById("metricTotal"),
    metricAverage: document.getElementById("metricAverage"),
    metricSteps: document.getElementById("metricSteps"),
    metricRequests: document.getElementById("metricRequests"),
    bestBadge: document.getElementById("bestBadge"),
    stepSlider: document.getElementById("stepSlider"),
    stepReadout: document.getElementById("stepReadout"),
    speedSlider: document.getElementById("speedSlider"),
    playButton: document.getElementById("playButton"),
    playIcon: document.querySelector("#playButton .play-icon"),
    playLabel: document.getElementById("playLabel"),
    prevButton: document.getElementById("prevButton"),
    nextButton: document.getElementById("nextButton"),
    stepTableBody: document.getElementById("stepTableBody"),
    tableCount: document.getElementById("tableCount"),
    sequenceLine: document.getElementById("sequenceLine"),
    exportButton: document.getElementById("exportButton"),
    recentList: document.getElementById("recentList"),
    clearRecentButton: document.getElementById("clearRecentButton")
  };

  function loadRecent() {
    try {
      var value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(value) ? value.slice(0, 5) : [];
    } catch (error) {
      return [];
    }
  }

  function saveRecent() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.recent.slice(0, 5)));
    } catch (error) {
      // The calculator remains usable when browser storage is unavailable.
    }
  }

  function formatNumber(value) {
    return Number(value).toLocaleString("zh-CN", { maximumFractionDigits: 3 });
  }

  function parseRequestTokens(value) {
    var normalized = String(value || "").replace(/，/g, ",");
    return normalized.split(/[\s,]+/).map(function trim(item) {
      return item.trim();
    }).filter(Boolean);
  }

  function updateInputCount() {
    var count = parseRequestTokens(elements.requests.value).length;
    elements.inputCount.textContent = count + " 个请求";
  }

  function setDirection(direction) {
    state.direction = direction === "down" ? "down" : "up";
    elements.directionControl.querySelectorAll("button[data-direction]").forEach(function update(button) {
      button.classList.toggle("active", button.dataset.direction === state.direction);
    });
  }

  function markPreset(name) {
    elements.presetList.querySelectorAll(".preset").forEach(function update(button) {
      button.classList.toggle("active", button.dataset.preset === name);
    });
  }

  function applyPreset(name) {
    if (name === "random") {
      var maxTrack = Math.max(20, Number(elements.maxTrack.value) || 199);
      var values = [];
      for (var i = 0; i < 10; i += 1) {
        values.push(Math.floor(Math.random() * (maxTrack + 1)));
      }
      elements.requests.value = values.join(", ");
      elements.head.value = String(Math.floor(maxTrack / 2));
      setDirection("up");
    } else {
      var preset = presets[name];
      if (!preset) {
        return;
      }
      elements.requests.value = preset.requests;
      elements.head.value = String(preset.head);
      elements.maxTrack.value = String(preset.maxTrack);
      setDirection(preset.direction);
    }
    markPreset(name);
    updateInputCount();
  }

  function showMessage(message) {
    elements.messageBar.textContent = message || "";
    elements.messageBar.hidden = !message;
  }

  function parseInputs() {
    var maxTrack = Number(elements.maxTrack.value);
    var head = Number(elements.head.value);

    if (!Number.isInteger(maxTrack) || maxTrack < 1 || maxTrack > 9999) {
      throw new Error("最大磁道号应为 1 到 9999 之间的整数。");
    }
    if (!Number.isInteger(head) || head < 0 || head > maxTrack) {
      throw new Error("初始磁头应位于 0 到 " + maxTrack + " 之间。");
    }

    var tokens = parseRequestTokens(elements.requests.value);
    if (tokens.length === 0) {
      throw new Error("请求序列不能为空。");
    }
    if (tokens.length > MAX_REQUESTS) {
      throw new Error("请求数量不能超过 " + MAX_REQUESTS + " 个。");
    }

    var requests = tokens.map(function parseTrack(token) {
      if (!/^\d+$/.test(token)) {
        throw new Error("请求序列中包含非整数：" + token);
      }
      var track = Number(token);
      if (track > maxTrack) {
        throw new Error("请求磁道 " + track + " 超出 0 到 " + maxTrack + " 的范围。");
      }
      return track;
    });

    return {
      requests: requests,
      head: head,
      maxTrack: maxTrack,
      direction: state.direction
    };
  }

  function runSimulation(options) {
    var settings = options || {};
    var input;

    try {
      input = parseInputs();
    } catch (error) {
      showMessage(error.message);
      return false;
    }

    stopPlayback();
    showMessage("");
    elements.runButton.disabled = true;
    var buttonLabel = elements.runButton.querySelector("span");
    buttonLabel.textContent = "正在计算";

    window.requestAnimationFrame(function calculate() {
      try {
        state.data = {
          requests: input.requests,
          head: input.head,
          maxTrack: input.maxTrack,
          direction: input.direction,
          algorithms: scheduling.scheduleAll(
            input.requests,
            input.head,
            input.maxTrack,
            input.direction
          )
        };

        var selectedExists = state.data.algorithms.some(function match(item) {
          return item.code === state.selected;
        });
        state.selected = selectedExists ? state.selected : "SSTF";
        state.step = selectedResult().steps.length;
        if (settings.remember !== false) {
          addRecent();
        }
        render();
      } finally {
        elements.runButton.disabled = false;
        buttonLabel.textContent = "运行六种算法";
      }
    });

    return true;
  }

  function selectedResult() {
    if (!state.data) {
      return null;
    }
    return state.data.algorithms.find(function match(item) {
      return item.code === state.selected;
    }) || state.data.algorithms[0];
  }

  function addRecent() {
    var result = selectedResult();
    if (!result) {
      return;
    }
    var record = {
      timestamp: Date.now(),
      requests: state.data.requests.slice(),
      head: state.data.head,
      maxTrack: state.data.maxTrack,
      direction: state.data.direction,
      algorithm: result.code,
      total: result.totalMovement
    };
    state.recent = [record].concat(state.recent).slice(0, 5);
    saveRecent();
  }

  function render() {
    renderAlgorithmTabs();
    renderSummary();
    renderChart();
    renderPlayback();
    renderStepTable();
    renderRecent();
  }

  function renderAlgorithmTabs() {
    if (!state.data) {
      elements.algorithmTabs.innerHTML = "";
      return;
    }
    var best = Math.min.apply(null, state.data.algorithms.map(function total(item) {
      return item.totalMovement;
    }));

    elements.algorithmTabs.innerHTML = state.data.algorithms.map(function create(item) {
      return [
        '<button type="button" class="algorithm-tab ',
        item.code === state.selected ? "active" : "",
        '" role="tab" aria-selected="',
        item.code === state.selected ? "true" : "false",
        '" data-code="',
        item.code,
        '">',
        '<span class="code">',
        item.code,
        "</span>",
        item.totalMovement === best ? '<span class="best-mark">最短</span>' : "",
        '<span class="name">',
        item.name,
        "</span>",
        '<span class="total">',
        formatNumber(item.totalMovement),
        "</span>",
        "</button>"
      ].join("");
    }).join("");

    elements.algorithmTabs.querySelectorAll(".algorithm-tab").forEach(function bind(button) {
      button.addEventListener("click", function selectAlgorithm() {
        stopPlayback();
        state.selected = button.dataset.code;
        state.step = selectedResult().steps.length;
        render();
      });
    });
  }

  function renderSummary() {
    var result = selectedResult();
    if (!result) {
      return;
    }
    var best = Math.min.apply(null, state.data.algorithms.map(function total(item) {
      return item.totalMovement;
    }));
    var bestItem = state.data.algorithms.find(function match(item) {
      return item.totalMovement === best;
    });

    elements.metricAlgorithm.textContent = result.code;
    elements.metricTotal.textContent = formatNumber(result.totalMovement);
    elements.metricAverage.textContent = Number(result.averageMovement).toFixed(3);
    elements.metricSteps.textContent = String(result.steps.length);
    elements.metricRequests.textContent = String(result.requestCount);
    elements.chartAlgorithm.textContent = result.code;
    elements.directionTag.textContent = state.data.direction === "up" ? "向外增大" : "向内减小";
    elements.bestBadge.textContent = result.totalMovement === best
      ? "当前最短"
      : "最短：" + bestItem.code;
  }

  function svgElement(name, attributes, text) {
    var node = document.createElementNS(SVG_NS, name);
    Object.keys(attributes || {}).forEach(function apply(key) {
      node.setAttribute(key, String(attributes[key]));
    });
    if (text !== undefined) {
      node.textContent = text;
    }
    return node;
  }

  function renderChart() {
    var result = selectedResult();
    var svg = elements.chart;
    svg.innerHTML = "";
    if (!result) {
      return;
    }

    var availableWidth = Math.max(280, Math.floor(elements.chartStage.clientWidth - 2));
    var narrow = availableWidth < 520;
    var width = availableWidth;
    var margin = {
      left: narrow ? 34 : 52,
      right: narrow ? 20 : 28,
      top: 39,
      bottom: 43
    };
    var totalSteps = result.steps.length;
    var rowGap = narrow ? 47 : 43;
    var plotHeight = Math.max(180, totalSteps * rowGap);
    var height = margin.top + margin.bottom + plotHeight;
    var plotRight = width - margin.right;
    var plotWidth = plotRight - margin.left;
    var axisY = margin.top + plotHeight;
    var maxTrack = Math.max(1, state.data.maxTrack);
    var tracks = result.tracks;
    var shown = Math.max(0, Math.min(state.step, totalSteps));

    state.lastChartWidth = availableWidth;
    svg.setAttribute("viewBox", "0 0 " + width + " " + height);
    svg.setAttribute("height", String(height));

    function x(track) {
      return margin.left + (Number(track) / maxTrack) * plotWidth;
    }

    function y(index) {
      return totalSteps === 0
        ? margin.top + plotHeight / 2
        : margin.top + (index / totalSteps) * plotHeight;
    }

    for (var guideIndex = 0; guideIndex <= totalSteps; guideIndex += 1) {
      svg.appendChild(svgElement("line", {
        x1: margin.left,
        y1: y(guideIndex),
        x2: plotRight,
        y2: y(guideIndex),
        class: "axis-guide"
      }));
    }

    var tickIntervals = narrow ? 4 : 8;
    for (var tickIndex = 0; tickIndex <= tickIntervals; tickIndex += 1) {
      var rawTick = (maxTrack * tickIndex) / tickIntervals;
      var tickStep = maxTrack > 100 ? 5 : 1;
      var tickValue = tickIndex === tickIntervals
        ? maxTrack
        : Math.round(rawTick / tickStep) * tickStep;
      var tickX = x(tickValue);
      svg.appendChild(svgElement("line", {
        x1: tickX,
        y1: axisY,
        x2: tickX,
        y2: axisY + 5,
        class: "axis-tick"
      }));
      svg.appendChild(svgElement("text", {
        x: tickX,
        y: axisY + 18,
        "text-anchor": "middle",
        class: "axis-label"
      }, tickValue));
    }

    svg.appendChild(svgElement("line", {
      x1: margin.left,
      y1: margin.top,
      x2: margin.left,
      y2: axisY,
      class: "axis-line"
    }));
    svg.appendChild(svgElement("line", {
      x1: margin.left,
      y1: axisY,
      x2: plotRight,
      y2: axisY,
      class: "axis-line"
    }));
    svg.appendChild(svgElement("text", {
      x: margin.left + plotWidth / 2,
      y: height - 5,
      "text-anchor": "middle",
      class: "axis-title"
    }, "磁道号"));
    svg.appendChild(svgElement("text", {
      x: 10,
      y: margin.top + plotHeight / 2,
      transform: "rotate(-90 10 " + (margin.top + plotHeight / 2) + ")",
      "text-anchor": "middle",
      class: "axis-title"
    }, "访问次序"));

    for (var segmentIndex = 1; segmentIndex <= totalSteps; segmentIndex += 1) {
      var segmentStatus = segmentIndex < shown
        ? "visited"
        : segmentIndex === shown
          ? "current"
          : "future";
      var fromX = x(tracks[segmentIndex - 1]);
      var fromY = y(segmentIndex - 1);
      var toX = x(tracks[segmentIndex]);
      var toY = y(segmentIndex);
      var segmentGroup = svgElement("g");
      segmentGroup.appendChild(svgElement("title", {},
        "第 " + segmentIndex + " 步：" + tracks[segmentIndex - 1] + " → " + tracks[segmentIndex]));
      segmentGroup.appendChild(svgElement("line", {
        x1: fromX,
        y1: fromY,
        x2: toX,
        y2: toY,
        class: "route-segment " + segmentStatus
      }));
      segmentGroup.appendChild(createArrow(fromX, fromY, toX, toY, segmentStatus, narrow));
      svg.appendChild(segmentGroup);
    }

    tracks.forEach(function addNode(track, index) {
      var status = index < shown ? "visited" : index === shown ? "current" : "future";
      var radius = narrow ? 11 : 12;
      var nodeX = x(track);
      var nodeY = y(index);
      var group = svgElement("g", {
        class: "node-group",
        "aria-label": index === 0
          ? "起点磁道 " + track
          : "第 " + index + " 次访问磁道 " + track
      });
      group.appendChild(svgElement("title", {}, index === 0
        ? "起点磁道：" + track
        : "第 " + index + " 次访问：" + tracks[index - 1] + " → " + track));
      group.appendChild(svgElement("circle", {
        cx: nodeX,
        cy: nodeY,
        r: radius,
        class: "node-circle " + status
      }));
      group.appendChild(svgElement("text", {
        x: nodeX,
        y: nodeY + 3.3,
        class: "node-index " + status
      }, String(index)));

      var labelOnLeft = nodeX > plotRight - 42;
      group.appendChild(svgElement("text", {
        x: labelOnLeft ? nodeX - radius - 5 : nodeX + radius + 5,
        y: nodeY + 4,
        "text-anchor": labelOnLeft ? "end" : "start",
        class: "node-track"
      }, track));
      group.addEventListener("click", function selectNode() {
        stopPlayback();
        state.step = index;
        renderChart();
        renderPlayback();
        renderStepTable();
      });
      svg.appendChild(group);

      if (index === 0) {
        svg.appendChild(svgElement("text", {
          x: nodeX,
          y: Math.max(14, nodeY - radius - 7),
          class: "start-caption"
        }, "起点"));
      }
    });

    elements.stepSlider.max = String(totalSteps);
    elements.stepSlider.value = String(shown);
    elements.stepReadout.textContent = shown + " / " + totalSteps;
  }

  function createArrow(fromX, fromY, toX, toY, status, narrow) {
    var deltaX = toX - fromX;
    var deltaY = toY - fromY;
    var length = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    if (length < 1) {
      return svgElement("polygon", { points: "", class: "route-arrow " + status });
    }

    var directionX = deltaX / length;
    var directionY = deltaY / length;
    var normalX = -directionY;
    var normalY = directionX;
    var centerX = fromX + deltaX * 0.58;
    var centerY = fromY + deltaY * 0.58;
    var reach = narrow ? 5.4 : 6.2;
    var halfBase = narrow ? 4.1 : 4.8;
    var tipX = centerX + directionX * reach;
    var tipY = centerY + directionY * reach;
    var baseX = centerX - directionX * reach * 0.65;
    var baseY = centerY - directionY * reach * 0.65;
    var leftX = baseX + normalX * halfBase;
    var leftY = baseY + normalY * halfBase;
    var rightX = baseX - normalX * halfBase;
    var rightY = baseY - normalY * halfBase;

    return svgElement("polygon", {
      points: [
        tipX + "," + tipY,
        leftX + "," + leftY,
        rightX + "," + rightY
      ].join(" "),
      class: "route-arrow " + status
    });
  }

  function renderPlayback() {
    var result = selectedResult();
    if (!result) {
      return;
    }
    elements.playButton.classList.toggle("is-playing", state.playing);
    elements.playIcon.setAttribute("d", state.playing
      ? "M8 5h3v14H8V5Zm5 0h3v14h-3V5Z"
      : "m8 5 11 7-11 7V5Z");
    elements.playLabel.textContent = state.playing ? "暂停" : "播放轨迹";
  }

  function renderStepTable() {
    var result = selectedResult();
    if (!result) {
      elements.stepTableBody.innerHTML = "";
      return;
    }
    var shown = Math.min(state.step, result.steps.length);
    elements.tableCount.textContent = result.steps.length + " 次移动";
    elements.stepTableBody.innerHTML = result.steps.map(function row(step, index) {
      var current = index === shown - 1;
      var visited = index < shown;
      return [
        '<tr class="',
        current ? "current" : visited ? "visited" : "",
        '">',
        "<td>",
        step.index,
        "</td><td>",
        step.from,
        "</td><td>",
        step.to,
        "</td><td>",
        step.distance,
        "</td><td>",
        step.cumulative,
        "</td></tr>"
      ].join("");
    }).join("");
    elements.sequenceLine.textContent = result.tracks.join(" → ");
  }

  function renderRecent() {
    if (state.recent.length === 0) {
      elements.recentList.innerHTML = '<div class="empty-state">运行实验后，参数会保存在当前浏览器。</div>';
      return;
    }

    elements.recentList.innerHTML = state.recent.map(function item(record, index) {
      var date = new Date(record.timestamp);
      var requests = record.requests.slice(0, 5).join(", ");
      if (record.requests.length > 5) {
        requests += "…";
      }
      var direction = record.direction === "up" ? "向外" : "向内";
      return [
        '<button type="button" class="recent-item" data-recent-index="',
        index,
        '">',
        '<span class="recent-main"><strong>',
        requests,
        '</strong><span>',
        date.toLocaleString("zh-CN", {
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit"
        }),
        " · 初始 ",
        record.head,
        " · ",
        direction,
        '</span></span><span class="recent-value">',
        record.algorithm,
        "<span>",
        formatNumber(record.total),
        " 磁道</span></span></button>"
      ].join("");
    }).join("");

    elements.recentList.querySelectorAll(".recent-item").forEach(function bind(button) {
      button.addEventListener("click", function restore() {
        var record = state.recent[Number(button.dataset.recentIndex)];
        elements.requests.value = record.requests.join(", ");
        elements.head.value = String(record.head);
        elements.maxTrack.value = String(record.maxTrack);
        setDirection(record.direction);
        state.selected = record.algorithm;
        markPreset("");
        updateInputCount();
        runSimulation();
      });
    });
  }

  function stopPlayback() {
    state.playing = false;
    if (state.timer) {
      window.clearTimeout(state.timer);
      state.timer = null;
    }
    if (elements.playLabel) {
      renderPlayback();
    }
  }

  function startPlayback() {
    var result = selectedResult();
    if (!result || result.steps.length === 0) {
      return;
    }
    if (state.playing) {
      stopPlayback();
      return;
    }
    if (state.step >= result.steps.length) {
      state.step = 0;
    }
    state.playing = true;
    renderPlayback();
    renderChart();
    renderStepTable();

    function tick() {
      if (!state.playing) {
        return;
      }
      var current = selectedResult();
      if (state.step >= current.steps.length) {
        stopPlayback();
        return;
      }
      state.step += 1;
      renderChart();
      renderStepTable();
      if (state.step >= current.steps.length) {
        stopPlayback();
        return;
      }
      state.timer = window.setTimeout(tick, state.speed);
    }

    state.timer = window.setTimeout(tick, state.speed);
  }

  function stepBy(delta) {
    var result = selectedResult();
    if (!result) {
      return;
    }
    stopPlayback();
    state.step = Math.max(0, Math.min(result.steps.length, state.step + delta));
    renderChart();
    renderPlayback();
    renderStepTable();
  }

  function exportCsv() {
    var result = selectedResult();
    if (!result) {
      return;
    }
    var rows = [
      ["算法", result.code],
      ["初始磁头", state.data.head],
      ["最大磁道号", state.data.maxTrack],
      ["初始方向", state.data.direction === "up" ? "向外增大" : "向内减小"],
      ["请求序列", state.data.requests.join(" ")],
      ["总移动磁道", result.totalMovement],
      ["平均寻道长度", Number(result.averageMovement).toFixed(3)],
      [],
      ["步", "起点", "终点", "移动", "累计"]
    ].concat(result.steps.map(function row(step) {
      return [step.index, step.from, step.to, step.distance, step.cumulative];
    }));

    var content = "\uFEFF" + rows.map(function row(values) {
      return values.map(function cell(value) {
        return '"' + String(value == null ? "" : value).replace(/"/g, '""') + '"';
      }).join(",");
    }).join("\r\n");
    var blob = new Blob([content], { type: "text/csv;charset=utf-8" });
    var link = document.createElement("a");
    var url = URL.createObjectURL(blob);
    link.href = url;
    link.download = result.code.toLowerCase() + "-disk-schedule.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  elements.form.addEventListener("submit", function submit(event) {
    event.preventDefault();
    runSimulation();
  });

  elements.requests.addEventListener("input", updateInputCount);
  elements.directionControl.addEventListener("click", function chooseDirection(event) {
    var button = event.target.closest("button[data-direction]");
    if (button) {
      setDirection(button.dataset.direction);
    }
  });

  elements.presetList.addEventListener("click", function choosePreset(event) {
    var button = event.target.closest("button[data-preset]");
    if (button) {
      applyPreset(button.dataset.preset);
    }
  });

  elements.stepSlider.addEventListener("input", function seek() {
    stopPlayback();
    state.step = Number(elements.stepSlider.value);
    renderChart();
    renderPlayback();
    renderStepTable();
  });

  elements.speedSlider.addEventListener("input", function changeSpeed() {
    state.speed = Number(elements.speedSlider.value);
  });

  elements.playButton.addEventListener("click", startPlayback);
  elements.prevButton.addEventListener("click", function previous() {
    stepBy(-1);
  });
  elements.nextButton.addEventListener("click", function next() {
    stepBy(1);
  });
  elements.exportButton.addEventListener("click", exportCsv);
  elements.clearRecentButton.addEventListener("click", function clearRecent() {
    state.recent = [];
    saveRecent();
    renderRecent();
  });

  var resizeTimer = null;
  window.addEventListener("resize", function handleResize() {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(function redraw() {
      if (!state.data) {
        return;
      }
      var nextWidth = Math.floor(elements.chartStage.clientWidth - 2);
      if (Math.abs(nextWidth - state.lastChartWidth) > 2) {
        renderChart();
      }
    }, 120);
  });

  applyPreset("classroom");
  runSimulation({ remember: false });
})();
