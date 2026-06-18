import React from "react";

export function ChartControls({ canZoomIn, canZoomOut, canPanBack, canPanForward, onZoomIn, onZoomOut, onReset, onPanBack, onPanForward }) {
  return (
    <div className="chart-controls" aria-label="Chart navigation controls">
      {onPanBack ? <button type="button" onClick={onPanBack} disabled={!canPanBack} title="Previous range" aria-label="Previous range">&#8249;</button> : null}
      <button type="button" onClick={onZoomOut} disabled={!canZoomOut} title="Zoom out" aria-label="Zoom out">-</button>
      <button type="button" onClick={onZoomIn} disabled={!canZoomIn} title="Zoom in" aria-label="Zoom in">+</button>
      <button type="button" className="chart-reset" onClick={onReset} disabled={!canZoomOut} title="Reset zoom">Reset</button>
      {onPanForward ? <button type="button" onClick={onPanForward} disabled={!canPanForward} title="Next range" aria-label="Next range">&#8250;</button> : null}
    </div>
  );
}
