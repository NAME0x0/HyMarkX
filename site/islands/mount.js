import * as hero from './hero.js'
import * as cost from './cost.js'
import { enhance } from './enhance.js'

/**
 * The host adapter — the only code on this site that knows how islands mount.
 *
 * HyMarkX emits `<div data-hmx-island="0">` and a manifest naming the module and export; it
 * never imports or evaluates anything. Resolving that name is the host's job (ADR-0016), which
 * is what keeps framework neutrality a property of the language rather than a claim about it.
 *
 * This adapter used React, because the component it mounted was a React component. Nothing in
 * HyMarkX asked for that — an island export here is a plain function that takes an element.
 * Dropping React removed 60 kB that existed to render one decorative div.
 */
const modules = {
  './islands/hero.js': hero,
  './islands/cost.js': cost,
}

async function mountIslands() {
  const response = await fetch('/index.islands.json')
  if (!response.ok) {
    return
  }
  for (const island of await response.json()) {
    const element = document.querySelector(`[data-hmx-island="${island.id}"]`)
    const mount = modules[island.from]?.[island.export]
    if (element === null || typeof mount !== 'function') {
      continue
    }
    mount(element, island.props)
  }
}

/*
 * Mounted after first paint, and skipped entirely for readers who asked for less motion. The
 * page is complete without this file; it should never be what a reader waits on.
 */
function start() {
  // Copy buttons and reveals are not motion for its own sake, so they run either way. Only the
  // shader is skipped for readers who asked for less movement.
  enhance()
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    void mountIslands()
  }
}

if (document.readyState === 'complete') {
  start()
} else {
  window.addEventListener('load', start, { once: true })
}
