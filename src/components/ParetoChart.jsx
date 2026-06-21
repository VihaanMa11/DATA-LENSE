import React from "react";
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, ResponsiveContainer } from "recharts";

export function ParetoChart({ data, title, barLabel = "Sales (INR)" }) {
  if (!data || data.length === 0) return <div style={{ color: "#888", padding: 16 }}>No data</div>;

  return (
    <div style={{ width: "100%", marginBottom: 24 }}>
      {title && <h3 style={{ color: "#1F497D", marginBottom: 8 }}>{title}</h3>}
      <ResponsiveContainer width="100%" height={360}>
        <ComposedChart data={data} margin={{ top: 10, right: 40, left: 10, bottom: 80 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" angle={-45} textAnchor="end" interval={0} tick={{ fontSize: 11, fill: "#1F1F1F" }} />
          <YAxis yAxisId="left" tickFormatter={v => `${(v / 100000).toFixed(1)}L`} tick={{ fontSize: 11 }} />
          <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} />
          <Tooltip formatter={(value, name) => name === "Cumulative %" ? `${value}%` : `INR ${(value / 100000).toFixed(2)}L`} />
          <Legend verticalAlign="top" />
          <ReferenceLine yAxisId="right" y={80} stroke="#C00000" strokeDasharray="6 3" label={{ value: "80%", fill: "#C00000", fontSize: 11 }} />
          <Bar yAxisId="left" dataKey="value" name={barLabel} fill="#2E75B6" radius={[2, 2, 0, 0]} />
          <Line yAxisId="right" type="monotone" dataKey="cumulativePct" name="Cumulative %" stroke="#C55A11" strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
