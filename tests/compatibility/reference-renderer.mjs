/**
 * A reference CommonMark + GFM renderer, used to check invariant 1 against real documents.
 *
 * The conformance suites check the spec's examples, which test constructs one at a time. This
 * checks whole documents, where constructs meet each other — which is where the divergence this
 * suite was written to find actually lived.
 *
 * micromark is the reference because it is the engine the parser is built on: any difference is
 * therefore something *we* added, not a disagreement between two implementations of the spec.
 *
 * Root devDependency, and named in `scripts/check-boundaries.mjs` as one of the few files
 * allowed to import the Markdown engine outside `@hymarkx/parser`. Nothing here reaches a
 * published package.
 */
import { micromark } from 'micromark'
import { gfm, gfmHtml } from 'micromark-extension-gfm'

/**
 * Renders with dangerous HTML allowed, matching `app` trust mode.
 *
 * `document` mode sanitizes, and sanitized output is *supposed* to differ from a reference
 * renderer — comparing against it would be measuring the trust boundary, not compatibility.
 */
export function referenceHtml(source) {
  return micromark(source, {
    allowDangerousHtml: true,
    extensions: [gfm()],
    htmlExtensions: [gfmHtml()],
  })
}

/**
 * Removes the one difference that is intentional.
 *
 * HMX emits `class="contains-task-list"` and `class="task-list-item"`, which is what GitHub
 * emits and what the GFM conformance fixtures in `tests/conformance/gfm.json` require. Bare
 * `micromark-extension-gfm` omits them. So HMX is the one following the fixtures here, and
 * stripping the classes from both sides is the only way to compare the rest.
 *
 * This is the only normalisation. Anything else that differs is a finding, not noise.
 */
export function normalize(html) {
  return html
    .replaceAll(' class="contains-task-list"', '')
    .replaceAll('<li class="task-list-item">', '<li>')
    .trim()
}
