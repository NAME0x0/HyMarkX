# HMX-P01 measurements

All values below were generated locally from the files in this directory. JavaScript was
minified with the Terser bundle shipped with Next.js 16.2.4 (version metadata unavailable). The gzip column is Node's `gzipSync` at
level 9 over the minified bytes. Multi-file comparison totals sum separately compressed
responses; HMX totals compress the single HTML response containing its inline script.

## Artifact sizes

| Implementation / artifact           |    Raw bytes | Minified bytes | Gzipped bytes | Notes                                                           |
| ----------------------------------- | -----------: | -------------: | ------------: | --------------------------------------------------------------- |
| HMX counter runtime                 |          778 |            543 |           367 | one inline response                                             |
| HMX counter generated bindings/glue |          119 |            108 |           102 |                                                                 |
| HMX counter HTML (script excluded)  |          106 |            106 |           104 | HTML was not minified                                           |
| HMX counter total page              |         1021 |            775 |           492 | HTML and inline script; one response                            |
| HMX two-way runtime                 |         1016 |            718 |           401 | includes input-binding support                                  |
| HMX two-way generated bindings/glue |          160 |            141 |           127 |                                                                 |
| HMX two-way HTML (script excluded)  |          166 |            166 |           129 | HTML was not minified                                           |
| HMX two-way total page              |         1360 |           1043 |           567 | HTML and inline script; one response                            |
| Vanilla counter runtime             |            0 |              0 |             0 | no framework/runtime                                            |
| Vanilla counter app/glue JS         |          187 |            171 |           142 |                                                                 |
| Vanilla counter HTML shell          |          317 |            317 |           208 | HTML was not minified                                           |
| Vanilla counter total payload       |          504 |            488 |           350 | HTML + JS; two responses summed                                 |
| React 18.3.1 runtime                |       142586 |         142586 |         47291 | React + ReactDOM production UMD CDN files; two responses summed |
| React counter app/glue JS           |          428 |            361 |           220 |                                                                 |
| React counter HTML shell            |          448 |            448 |           239 | HTML was not minified                                           |
| React counter total payload         |       143462 |         143395 |         47750 | HTML + app + two CDN files                                      |
| Svelte compiled counter             | not measured |   not measured |  not measured | optional comparison dependency was not added                    |

## Author source size

Lines are physical lines excluding a final empty line. Characters are JavaScript string
code units; every compared source is ASCII, so this also equals its UTF-8 byte count.

| Source                        | Lines | Characters |
| ----------------------------- | ----: | ---------: |
| HMX counter document          |     9 |        104 |
| React counter HTML + app JS   |    30 |        876 |
| Vanilla counter HTML + app JS |    20 |        504 |

## Measurement checks

- The raw counter runtime was independently checked with filesystem metadata:
  `dist/counter.runtime.js` is 778 bytes, matching `Buffer.byteLength`.
- Both minified HMX pages were driven with JSDOM 21.1.2 after measurement; the counter,
  input-to-state update, and rename event all produced the expected bound text.
- Registry access was unavailable in this environment. DOM verification used a complete
  pre-existing JSDOM installation, and minification used the pre-existing Next.js Terser
  bundle named above. These are measurement tools and are not included in any payload row.
- React uses the installed React 18.3.1 production UMD files corresponding exactly to the
  pinned unpkg CDN URLs in `comparisons/react-counter.html`.
- Svelte is explicitly not measured; adding and configuring a compiler only for an optional
  row would broaden this experiment without strengthening its core verdict.

## Findings and verdict

The counter and the two-way input probe both work with static dependency tables and targeted
DOM writes. A state mutation updates only the cached text nodes and input elements listed for
that state name. There is no virtual DOM, tree diff, or node replacement. Static documents
take the exact existing compiler path and emit no script.

The harder probe exposed one concrete compiler-model mismatch: component render plans only
describe paired wrappers, so the real compiler emits `<input ...></input>`. HTML parsers
normalize that to a working input element, and two-way behavior is clean after normalization,
but the serialized HTML is invalid for a void element. A production design needs a void-tag
render-plan capability rather than preserving this compromise.

The second document also does not parse verbatim as printed in HMX-P01: a backslash-escaped
double quote inside the double-quoted `on-click` value makes the current parser treat the
button block as prose and report `HMX1011`. The working probe changes only the outer
attribute delimiter to a single quote. `documents/input-binding-as-brief.hmx` and an
automated test preserve this negative result.

The AST also retains decoded attribute values but not an explicit quoted/unquoted flag. This
prototype distinguishes `value=1` from `value="1"` by following the attribute's real AST
source spans into the parser-normalized source. That remains AST-driven and uses no source
preprocessing, but a semantic literal-kind field would make the eventual expression phase
cleaner.

Verdict: compiled small-runtime interactivity is achievable in HyMarkX's current design for
the tested state, event, text-binding, and two-way-input semantics. Nothing fundamental in
the parser AST or restricted expression model blocks it. The current compiler render-plan
shape blocks clean void-element emission, and the AST makes literal-kind recovery awkward;
both are bounded design gaps, not reasons to reject the interactivity thesis. This prototype
does not establish production security, general attribute expressions, SSR, hydration, or
component scoping.
