# Development server

```bash
hmx dev                    # serve the current directory on 127.0.0.1:4321
hmx dev site               # serve ./site
hmx dev --out 3000         # choose a port
hmx dev --trust app        # enable scripts and raw HTML while developing
```

Open the printed URL. Editing any file in the tree reloads the page.

## Routing

| URL | Resolves to |
|---|---|
| `/` | `index.hmx`, then `index.md` |
| `/about` | `about.hmx`, `about.md`, `about/index.hmx`, `about/index.md` |
| `/logo.svg` | the file itself, served as a static asset |

Anything that is not a document and not found returns 404. Nothing outside the served
directory is reachable.

## How it works, and what it deliberately is not

**It is not a bundler.** There is no module graph, no transform pipeline, and no build
output directory. `hmx dev` compiles a document when it is requested and serves the result.

**There is no build cache.** Compiling per request removes cache invalidation as a source of
bugs entirely, and at the sizes HMX targets a recompile costs a few milliseconds — around
11 ms for a 2 KB page. The file watcher exists only to tell open browsers to reload.

**Component resolution is shared with `hmx build`.** The dev server does not carry its own
copy, so a page cannot render one way here and another way in a build.

## The reload client

`hmx dev` injects a small `<script>` that listens for server-sent events and reloads on
change.

It is injected **only** by the dev server. `hmx build` output never contains it — asserted
by a test for both static and interactive documents, because a development convenience
leaking into a production build would break the output proportionality that makes HMX worth
using.

## Trust mode

The server defaults to `document` mode, the same default as `hmx build`, so what you see
locally matches what an untrusted reader would get. Pass `--trust app` when you are
developing something that needs raw HTML or `<style>` blocks.

The server binds to `127.0.0.1` only. It compiles local files and is not intended to be
reachable from a network.

## Diagnostics

Warnings and errors print to the terminal as you browse. A document that fails to compile
serves a readable error page rather than a blank screen, and reloads when you fix it.

## What it serves

The same complete HTML document `hmx build` writes — doctype, `<head>`, title and all — with a
live-reload client appended inside the body. The CSS and JavaScript are inlined rather than
linked, because the dev server has no sidecar files on disk to point at.

That equivalence is the point: a preview that assembled the page differently from the build
would be previewing a different artefact than the one that ships.
