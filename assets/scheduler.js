(function attachScheduler(global) {
  "use strict";

  var algorithms = {
    FCFS: {
      code: "FCFS",
      name: "先来先服务",
      description: "按请求到达顺序访问，公平直观，但磁头往返可能较多。"
    },
    SSTF: {
      code: "SSTF",
      name: "最短寻道优先",
      description: "每次选择距离当前磁头最近的请求，寻道距离较短，但远端请求可能等待较久。"
    },
    SCAN: {
      code: "SCAN",
      name: "扫描算法",
      description: "沿当前方向移动到磁盘边界，再反向服务剩余请求。"
    },
    "C-SCAN": {
      code: "C-SCAN",
      name: "循环扫描",
      description: "只在一个方向服务请求，到达边界后返回另一边界继续扫描。"
    },
    LOOK: {
      code: "LOOK",
      name: "LOOK 算法",
      description: "沿当前方向服务到最后一个请求后折返，不额外移动到磁盘边界。"
    },
    "C-LOOK": {
      code: "C-LOOK",
      name: "循环 LOOK",
      description: "在首尾请求之间循环折返，不执行无请求的边界空行程。"
    }
  };

  function scheduleAll(requests, initialHead, maxTrack, direction) {
    var normalizedDirection = String(direction).toLowerCase() === "down" ? "down" : "up";
    return [
      fcfs(requests, initialHead, normalizedDirection),
      sstf(requests, initialHead, normalizedDirection),
      scan(requests, initialHead, maxTrack, normalizedDirection),
      cScan(requests, initialHead, maxTrack, normalizedDirection),
      look(requests, initialHead, normalizedDirection),
      cLook(requests, initialHead, normalizedDirection)
    ];
  }

  function fcfs(requests, initialHead, direction) {
    var path = [initialHead].concat(requests.slice());
    return build("FCFS", direction, requests.length, path);
  }

  function sstf(requests, initialHead, direction) {
    var pending = requests.slice();
    var path = [initialHead];
    var current = initialHead;

    while (pending.length > 0) {
      var bestIndex = 0;
      var bestDistance = Math.abs(pending[0] - current);
      for (var i = 1; i < pending.length; i += 1) {
        var distance = Math.abs(pending[i] - current);
        if (distance < bestDistance || (distance === bestDistance && pending[i] < pending[bestIndex])) {
          bestIndex = i;
          bestDistance = distance;
        }
      }
      current = pending.splice(bestIndex, 1)[0];
      path.push(current);
    }

    return build("SSTF", direction, requests.length, path);
  }

  function scan(requests, initialHead, maxTrack, direction) {
    var sorted = requests.slice().sort(compareNumbers);
    var path = [initialHead];

    if (direction === "up") {
      appendTracks(path, sorted, initialHead, true, true);
      appendBoundary(path, maxTrack);
      appendTracks(path, sorted, initialHead, false, false);
    } else {
      appendTracks(path, sorted, initialHead, false, false);
      appendBoundary(path, 0);
      appendTracks(path, sorted, initialHead, true, true);
    }

    return build("SCAN", direction, requests.length, path);
  }

  function cScan(requests, initialHead, maxTrack, direction) {
    var sorted = requests.slice().sort(compareNumbers);
    var path = [initialHead];

    if (direction === "up") {
      appendTracks(path, sorted, initialHead, true, true);
      appendBoundary(path, maxTrack);
      appendBoundary(path, 0);
      appendLowerAscending(path, sorted, initialHead);
    } else {
      appendTracks(path, sorted, initialHead, false, false);
      appendBoundary(path, 0);
      appendBoundary(path, maxTrack);
      appendUpperDescending(path, sorted, initialHead);
    }

    return build("C-SCAN", direction, requests.length, path);
  }

  function look(requests, initialHead, direction) {
    var sorted = requests.slice().sort(compareNumbers);
    var path = [initialHead];

    if (direction === "up") {
      appendTracks(path, sorted, initialHead, true, true);
      appendTracks(path, sorted, initialHead, false, false);
    } else {
      appendTracks(path, sorted, initialHead, false, true);
      appendTracks(path, sorted, initialHead, true, false);
    }

    return build("LOOK", direction, requests.length, path);
  }

  function cLook(requests, initialHead, direction) {
    var sorted = requests.slice().sort(compareNumbers);
    var path = [initialHead];

    if (direction === "up") {
      appendTracks(path, sorted, initialHead, true, true);
      appendLowerAscending(path, sorted, initialHead);
    } else {
      appendTracks(path, sorted, initialHead, false, true);
      appendUpperDescending(path, sorted, initialHead);
    }

    return build("C-LOOK", direction, requests.length, path);
  }

  function build(code, direction, requestCount, path) {
    var steps = [];
    var cumulative = 0;
    for (var i = 1; i < path.length; i += 1) {
      var from = path[i - 1];
      var to = path[i];
      var distance = Math.abs(to - from);
      cumulative += distance;
      steps.push({
        index: i,
        from: from,
        to: to,
        distance: distance,
        cumulative: cumulative
      });
    }

    var definition = algorithms[code];
    return {
      code: code,
      name: definition.name,
      description: definition.description,
      direction: direction,
      requestCount: requestCount,
      totalMovement: cumulative,
      averageMovement: requestCount === 0 ? 0 : cumulative / requestCount,
      tracks: path.slice(),
      steps: steps
    };
  }

  function compareNumbers(left, right) {
    return left - right;
  }

  function appendTracks(path, sorted, initialHead, upperSide, includeEqual) {
    if (upperSide) {
      sorted.forEach(function addUpper(value) {
        if (value > initialHead || (includeEqual && value === initialHead)) {
          appendUnique(path, value);
        }
      });
      return;
    }

    for (var i = sorted.length - 1; i >= 0; i -= 1) {
      var value = sorted[i];
      if (value < initialHead || (includeEqual && value === initialHead)) {
        appendUnique(path, value);
      }
    }
  }

  function appendBoundary(path, boundary) {
    appendUnique(path, boundary);
  }

  function appendLowerAscending(path, sorted, initialHead) {
    sorted.forEach(function addLower(value) {
      if (value < initialHead) {
        appendUnique(path, value);
      }
    });
  }

  function appendUpperDescending(path, sorted, initialHead) {
    for (var i = sorted.length - 1; i >= 0; i -= 1) {
      if (sorted[i] > initialHead) {
        appendUnique(path, sorted[i]);
      }
    }
  }

  function appendUnique(path, value) {
    if (path.length === 0 || path[path.length - 1] !== value) {
      path.push(value);
    }
  }

  var api = Object.freeze({
    algorithms: algorithms,
    scheduleAll: scheduleAll
  });

  global.DiskScheduling = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
