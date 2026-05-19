"use client";

import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, CartesianGrid, Tooltip } from "recharts";
import { MONTHS } from "@/lib/utils";

export function PhenologyChart({
  data,
  title,
}: {
  data: Array<{ month: number; count: number }>;
  title?: string;
}) {
  const full = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const found = data.find((d) => d.month === m);
    return { month: m, name: MONTHS[i], count: found?.count ?? 0 };
  });
  return (
    <div className="w-full">
      {title ? <div className="mb-1 text-xs font-medium text-moss-600">{title}</div> : null}
      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={full} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
            <Tooltip
              contentStyle={{ fontSize: 11 }}
              formatter={(v: number) => [v.toLocaleString(), "Observations"]}
              labelFormatter={(l) => `Month: ${l}`}
            />
            <Bar dataKey="count" fill="#116dff" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
