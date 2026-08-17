import { useState } from 'react'

export function Grid({ columns, gap, children }) {
  return (
    <div className="grid" style={{ '--cols': columns, '--gap': gap }}>
      {children}
    </div>
  )
}

export function Metric({ label, children }) {
  return (
    <div className="metric">
      <p className="metric-label">{label}</p>
      <p className="metric-value">{children}</p>
    </div>
  )
}

export function Note({ title, type, children }) {
  return (
    <aside className={`note note-${type}`}>
      <p className="note-title">{title}</p>
      <p>{children}</p>
    </aside>
  )
}

export function Counter({ start }) {
  const [signups, setSignups] = useState(start)
  return (
    <>
      <button onClick={() => setSignups(signups + 1)}>Add signup</button>
      <p>Signups today: {signups}.</p>
    </>
  )
}
