import { useState } from 'react'
import { Grid, Metric, Note } from './components'

export default function Dashboard() {
  const [signups, setSignups] = useState(128)
  return (
    <>
      <h1>Analytics</h1>
      <Grid columns={3} gap={4}>
        <Metric label="Revenue">$42,500</Metric>
        <Metric label="Users">14,302</Metric>
        <Metric label="Growth">+18.4%</Metric>
      </Grid>
      <Note title="Heads up" type="warning">
        Figures are preliminary.
      </Note>
      <button onClick={() => setSignups(signups + 1)}>Add signup</button>
      <p>Signups today: {signups}.</p>
    </>
  )
}
