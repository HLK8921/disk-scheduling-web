"use strict";

var assert = require("node:assert/strict");
var scheduling = require("../assets/scheduler.js");

function resultFor(results, code) {
  var result = results.find(function match(item) {
    return item.code === code;
  });
  assert.ok(result, "missing algorithm: " + code);
  return result;
}

function runClassroomExample() {
  var results = scheduling.scheduleAll(
    [76, 147, 42, 131, 23, 135, 59, 61],
    48,
    199,
    "up"
  );
  var expected = {
    FCFS: 591,
    SSTF: 217,
    SCAN: 327,
    "C-SCAN": 392,
    LOOK: 223,
    "C-LOOK": 242
  };

  Object.keys(expected).forEach(function check(code) {
    assert.equal(resultFor(results, code).totalMovement, expected[code], code);
  });
  assert.deepEqual(
    resultFor(results, "SSTF").tracks,
    [48, 42, 59, 61, 76, 23, 131, 135, 147]
  );
  assert.equal(resultFor(results, "SCAN").averageMovement, 40.875);
}

function runBoundaryAndDuplicateExample() {
  var results = scheduling.scheduleAll([0, 199, 0, 100], 100, 199, "down");
  assert.equal(resultFor(results, "FCFS").requestCount, 4);

  ["SCAN", "C-SCAN"].forEach(function checkRange(code) {
    resultFor(results, code).tracks.forEach(function checkTrack(track) {
      assert.ok(track >= 0 && track <= 199, code + " out of range");
    });
  });
  assert.ok(resultFor(results, "C-LOOK").totalMovement > 0);
}

function runSingleRequestExample() {
  var results = scheduling.scheduleAll([75], 25, 199, "up");
  assert.equal(resultFor(results, "SCAN").totalMovement, 174);
  assert.equal(resultFor(results, "C-SCAN").totalMovement, 373);

  ["FCFS", "SSTF", "LOOK", "C-LOOK"].forEach(function check(code) {
    var result = resultFor(results, code);
    assert.equal(result.totalMovement, 50, code);
    assert.equal(result.steps.length, 1, code + " steps");
  });

  assert.ok(resultFor(results, "C-SCAN").tracks.includes(199));
  assert.ok(resultFor(results, "C-SCAN").tracks.includes(0));
}

runClassroomExample();
runBoundaryAndDuplicateExample();
runSingleRequestExample();
console.log("PASS: scheduler totals, sequence, boundaries and single-request cases");
