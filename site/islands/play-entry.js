import * as play from './play.js'

/**
 * The playground's own island host.
 *
 * Separate from the home page's bundle on purpose: this one contains the compiler, and no
 * reader of the landing page should download a compiler to look at a headline. Same contract
 * as the other adapter — HyMarkX names a module and an export, the host resolves it.
 */
const modules = {
  './islands/play.js': play,
}

async function mountIslands() {
  const response = await fetch('/play.islands.json')
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

if (document.readyState === 'complete') {
  void mountIslands()
} else {
  window.addEventListener('load', () => void mountIslands(), { once: true })
}
