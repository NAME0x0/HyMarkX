#!/usr/bin/env node
// The `hymarkx` package exists so `npm install hymarkx` works; the implementation lives in
// `@hymarkx/cli`. Importing the subpath runs it — `bin.js` there sets `process.exitCode` at
// module scope, so there is nothing to call and nothing to forward.
import '@hymarkx/cli/bin'
