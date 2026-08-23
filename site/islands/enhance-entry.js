/**
 * Progressive enhancement, on every page.
 *
 * Split from the island bundle so a document with no island — the documentation page, for
 * instance — still gets copy buttons and a working nav without loading a shader it does not
 * have. The page is complete before this runs; nothing here is required to read it.
 */
import { enhance } from './enhance.js'

if (document.readyState === 'complete') {
  enhance()
} else {
  window.addEventListener('load', enhance, { once: true })
}
