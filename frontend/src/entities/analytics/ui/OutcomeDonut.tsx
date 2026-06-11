'use client';

import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import { formatPercent } from '@/shared/lib/format';
import type { OutcomeDonutProps } from '../types';
import { OUTCOME_META, EMPTY_FILL, ORDER } from '../constants';

export function OutcomeDonut({ distribution, total }: OutcomeDonutProps) {
  const data = ORDER.map((key) => ({
    key,
    label: OUTCOME_META[key].label,
    color: OUTCOME_META[key].color,
    value: distribution[key],
  }));

  const hasData = total > 0;

  return (
    <div className="donut">
      <div className="donut-chart">
        <ResponsiveContainer width="100%" height={180}>
          <PieChart>
            <Pie
              data={hasData ? data : [{ key: 'empty', value: 1, color: EMPTY_FILL }]}
              dataKey="value"
              innerRadius={56}
              outerRadius={80}
              startAngle={90}
              endAngle={-270}
              paddingAngle={hasData ? 3 : 0}
              stroke="none"
            >
              {(hasData ? data : [{ color: EMPTY_FILL }]).map((d, i) => (
                <Cell key={i} fill={d.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="donut-center">
          <span className="donut-center-num">{total}</span>
          <span className="donut-center-label">상담 기록</span>
        </div>
      </div>

      <ul className="donut-legend">
        {data.map((d) => (
          <li key={d.key} className="donut-legend-item">
            <span className="donut-swatch" style={{ background: d.color }} aria-hidden="true" />
            <span className="donut-legend-label">{d.label}</span>
            <span className="donut-legend-value">
              {d.value}
              <span className="muted donut-legend-pct">
                {' '}
                {hasData ? formatPercent(d.value / total, 0) : '0%'}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
