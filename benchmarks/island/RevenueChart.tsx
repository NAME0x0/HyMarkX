import { useState } from 'react'

/** A foreign component: the kind of thing HMX cannot express and should not try to. */
export function RevenueChart({ series, live }: { series: string; live?: boolean }) {
  const [bars, setBars] = useState([42, 58, 71])
  return (
    <figure data-chart={series}>
      <svg viewBox="0 0 90 40" width="180" height="80" role="img" aria-label={`Revenue, ${series}`}>
        {bars.map((value, index) => (
          <rect
            key={index}
            x={index * 30 + 4}
            y={40 - value / 2}
            width="22"
            height={value / 2}
            fill="#2563eb"
          />
        ))}
      </svg>
      <figcaption>
        {series} · total {bars.reduce((sum, value) => sum + value, 0)}
        {live === true ? (
          <button onClick={() => setBars(bars.map((value) => value + 1))}>grow</button>
        ) : null}
      </figcaption>
    </figure>
  )
}
