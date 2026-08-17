# Foreign components (TSX and other frameworks)

When HMX cannot express something — a chart, a map, a rich editor — you reference a component
written in something that can.

```md
::island{from="./RevenueChart.tsx" export="RevenueChart" series="monthly" live}
```

`app` trust mode only. `from` is a relative or package path; `export` defaults to `default`;
every other attribute becomes a prop.

## What HMX does, and does not do

The compiler emits a placeholder and a manifest entry:

```html
<div data-hmx-island="0"></div>
```

```json
[{ "id": 0, "from": "./RevenueChart.tsx", "export": "RevenueChart",
   "props": { "series": "monthly", "live": true } }]
```

That is all. **The compiler never imports, transpiles, or evaluates the module.** It has not
read the file and does not know whether React, Vue, or nothing at all will render it.

Two consequences worth being blunt about:

1. **`hmx build` output for a document with an island is not runnable on its own.** You need a
   host that resolves the manifest, bundles the modules, and mounts them.
2. **HMX has no framework dependency**, and never gains one. That is what keeps framework
   neutrality a property rather than a slogan (ADR-0016).

## What it costs

Measured by `benchmarks/island/prove.mjs`, which compiles a document, bundles a real React
component with esbuild, mounts it, and clicks it:

| | gzipped |
|---|---|
| The HMX page itself | **114 B** |
| One React island (React + ReactDOM + the component) | **46,273 B** |

Four hundred times the page. This is why islands are explicit rather than inferred from an
import statement, and why every island emits `HMX2070` naming the module — a cost that is not
surfaced is a cost nobody notices.

If a component can be expressed in HMX, express it in HMX.

## Writing the host adapter

The adapter is the only framework-aware code. A React one, in full:

```js
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import * as chart from './RevenueChart.tsx'

const modules = { './RevenueChart.tsx': chart }

export function mountIslands(manifest) {
  for (const island of manifest) {
    const element = document.querySelector(`[data-hmx-island="${island.id}"]`)
    const component = modules[island.from]?.[island.export]
    if (element === null || component === undefined) continue
    createRoot(element).render(createElement(component, island.props))
  }
}
```

A working example lives in `benchmarks/island/`.

## Limits at this version

- **Props are scalars only** — string, number, boolean, null. No objects, no arrays, no
  callbacks. Passing a function would need a runtime bridge between HMX state and the
  framework, which is a much larger design.
- **No children.** You cannot wrap HMX content in a foreign component.
- **No server rendering.** The placeholder is empty until the host mounts, so an island is
  blank with JavaScript disabled.
- **HMX cannot be imported *into* TSX.** That is a bundler-loader problem and belongs with
  the integrations work.

Specifiers naming a remote origin are refused with `HMX2072`: absolute URLs, `data:`,
`file:`, and protocol-relative `//host/x.js`.
