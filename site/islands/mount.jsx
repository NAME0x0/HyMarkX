import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import * as hero from './Hero.jsx'

/**
 * The host adapter — the only framework-aware code on this site.
 *
 * HyMarkX emits `<div data-hmx-island="0">` and a manifest naming the module; it never imports
 * or evaluates anything. Resolving that name to a component is the host's job, which is what
 * keeps framework neutrality a property of the language rather than a claim about it.
 */
const modules = {
  './islands/Hero.jsx': hero,
}

async function mountIslands() {
  const response = await fetch('/index.islands.json')
  if (!response.ok) {
    return
  }
  for (const island of await response.json()) {
    const element = document.querySelector(`[data-hmx-island="${island.id}"]`)
    const component = modules[island.from]?.[island.export]
    if (element === null || component === undefined) {
      continue
    }
    createRoot(element).render(createElement(component, island.props))
  }
}

/*
 * Mounted after first paint, and skipped entirely for readers who asked for less motion. The
 * page is complete without this file; it should never be what a reader waits on.
 */
if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  if (document.readyState === 'complete') {
    void mountIslands()
  } else {
    window.addEventListener('load', () => void mountIslands(), { once: true })
  }
}
