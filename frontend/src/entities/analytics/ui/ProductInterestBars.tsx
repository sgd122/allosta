'use client';

import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import type { ProductInterestBarsProps } from '../types';
import { BAR_COLORS } from '../constants';

export function ProductInterestBars({ items }: ProductInterestBarsProps) {
  if (items.length === 0) {
    return <p className="muted dash-empty-note">아직 언급된 상품이 없습니다.</p>;
  }

  const data = items.slice(0, 6).map((p) => ({
    name: p.productName,
    count: p.count,
  }));

  const chartHeight = Math.max(140, data.length * 46);

  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <BarChart data={data} layout="vertical" margin={{ left: 4, right: 28, top: 4, bottom: 4 }}>
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="name"
          width={120}
          tickLine={false}
          axisLine={false}
          tick={{ fill: '#3c4f4c', fontSize: 13, fontFamily: 'IBM Plex Sans' }}
        />
        <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={20} isAnimationActive={false}>
          {data.map((_, i) => (
            <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
          ))}
          <LabelList
            dataKey="count"
            position="right"
            style={{ fill: '#122321', fontSize: 13, fontWeight: 600 }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
