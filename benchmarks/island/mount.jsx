import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import * as chart from './RevenueChart.tsx'

/**
 * The React adapter for HMX's foreign-component contract.
 *
 * HMX emits `<div data-hmx-island="N">` plus a manifest of { id, from, export, props }.
 * Everything framework-specific lives here, which is what keeps ADR-0016's neutrality claim
 * true: the compiler has no idea React exists.
 */
const modules = { './RevenueChart.tsx': chart }

export function mountIslands(manifest) {
  for (const island of manifest) {
    const element = document.querySelector(`[data-hmx-island="${island.id}"]`)
    const component = modules[island.from]?.[island.export]
    if (element === null || component === undefined) continue
    createRoot(element).render(createElement(component, island.props))
  }
}

globalThis.mountIslands = mountIslands
