import React from "react";
import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

// Bubble scatter: x = net sales (lakhs), y = collection rate %, z = active months.
export function ScatterPlot({ data, xLabel = "Net Sales (L)", yLabel = "Collection %" }) {
  if (!data || data.length === 0) return <div className="empty">No data for current filters</div>;
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ScatterChart margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" dataKey="x" name={xLabel} tick={{ fontSize: 11 }} label={{ value: xLabel, position: "insideBottom", offset: -15, fontSize: 11 }} />
        <YAxis type="number" dataKey="y" name={yLabel} tick={{ fontSize: 11 }} label={{ value: yLabel, angle: -90, position: "insideLeft", fontSize: 11 }} />
        <ZAxis type="number" dataKey="z" range={[40, 400]} name="Active Months" />
        <ReferenceLine y={85} stroke="#2fd083" strokeDasharray="5 4" label={{ value: "Target 85%", fontSize: 10, fill: "#2fd083" }} />
        <Tooltip cursor={{ strokeDasharray: "3 3" }} formatter={(v, n) => [n === "Net Sales (L)" ? `${v}L` : n === "Collection %" ? `${v}%` : v, n]}
          content={({ payload }) => {
            if (!payload || !payload.length) return null;
            const p = payload[0].payload;
            return (
              <div style={{ background: "#fff", border: "1px solid #ddd", borderRadius: 6, padding: "6px 10px", fontSize: 12 }}>
                <strong>{p.name}</strong><br />
                Net Sales: {p.x}L<br />
                Collection: {p.y}%<br />
                Active Months: {p.z}
              </div>
            );
          }}
        />
        <Scatter data={data} fill="#1976d2" fillOpacity={0.6} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}
