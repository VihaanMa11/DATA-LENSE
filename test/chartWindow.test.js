import test from "node:test";
import assert from "node:assert/strict";
import { createChartWindow, panChartWindow, zoomChartWindow } from "../src/chartWindow.js";

test("createChartWindow starts with the complete series", () => {
  assert.deepEqual(createChartWindow(12), { start: 0, size: 12 });
});

test("zoomChartWindow zooms in around the current center", () => {
  assert.deepEqual(zoomChartWindow({ start: 0, size: 12 }, 12, "in"), { start: 2, size: 8 });
});

test("zoomChartWindow zooms out and clamps to the complete series", () => {
  assert.deepEqual(zoomChartWindow({ start: 3, size: 6 }, 12, "out"), { start: 1, size: 10 });
  assert.deepEqual(zoomChartWindow({ start: 0, size: 12 }, 12, "out"), { start: 0, size: 12 });
});

test("panChartWindow moves within bounds", () => {
  assert.deepEqual(panChartWindow({ start: 2, size: 6 }, 12, 3), { start: 5, size: 6 });
  assert.deepEqual(panChartWindow({ start: 5, size: 6 }, 12, 4), { start: 6, size: 6 });
  assert.deepEqual(panChartWindow({ start: 1, size: 6 }, 12, -4), { start: 0, size: 6 });
});
