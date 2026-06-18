const MIN_WINDOW_SIZE = 4;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function createChartWindow(length) {
  return { start: 0, size: Math.max(0, length) };
}

export function zoomChartWindow(window, length, direction) {
  const total = Math.max(0, length);
  if (!total) return { start: 0, size: 0 };
  const delta = direction === "in" ? -4 : 4;
  const size = clamp(window.size + delta, Math.min(MIN_WINDOW_SIZE, total), total);
  const center = window.start + window.size / 2;
  const start = clamp(Math.round(center - size / 2), 0, total - size);
  return { start, size };
}

export function panChartWindow(window, length, amount) {
  const size = clamp(window.size, 0, Math.max(0, length));
  return {
    start: clamp(window.start + amount, 0, Math.max(0, length - size)),
    size,
  };
}
