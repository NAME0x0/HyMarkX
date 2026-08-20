import { visit } from '@hymarkx/ast'
import type { Attribute, Diagnostic, Node } from '@hymarkx/ast'
import { parse } from '@hymarkx/parser'

/** Options controlling formatting. */
export interface FormatOptions {
  /** File path used in diagnostics. Default: `'<anonymous>'`. */
  readonly from?: string
}

/** The outcome of formatting a document. */
export interface FormatResult {
  /** Formatted source. Equals the input when nothing needed changing. */
  readonly source: string
  /** Whether `source` differs from the input. */
  readonly changed: boolean
  /** Parse diagnostics. A document with errors is returned unformatted. */
  readonly diagnostics: readonly Diagnostic[]
}

/**
 * One replacement of a source range.
 *
 * The formatter rewrites ranges rather than printing the tree back out. Printing would
 * reformat prose as a side effect, and ADR-0015 requires that a document containing no HMX
 * construct come back byte-identical — a property that is structural here rather than a
 * promise the printer has to keep.
 */
interface Edit {
  readonly start: number
  readonly end: number
  readonly text: string
}

/** Renders one attribute in canonical form, preserving shorthand spelling. */
function formatAttribute(attribute: Attribute, source: string): string {
  const written = source.slice(attribute.nameSpan.start.offset, attribute.nameSpan.end.offset)
  if (written.startsWith('#') || written.startsWith('.')) {
    return written
  }
  if (attribute.value === null) {
    return attribute.name
  }
  return `${attribute.name}="${escapeAttributeValue(attribute.value)}"`
}

/**
 * Serialises a value into double quotes, escaping per ADR-0018.
 *
 * The previous version chose a quote character based on what the value contained and emitted the
 * value raw. That worked while a value could hold only one kind of quote; once both became
 * expressible it produced `'he said 'hi' and "bye"'`, which is broken markup — the formatter
 * silently corrupting a document it was asked to tidy.
 *
 * One canonical quote is what a formatter should pick anyway. The AST records the decoded value
 * and not how it was written, so preserving the author's original quoting is not possible today;
 * normalising is honest, and `"` is the more common choice.
 *
 * Backslashes are escaped only where they would otherwise be read as an escape — before a quote,
 * before another backslash, or at the end of the value. A blanket rule would rewrite every
 * Windows path into a doubled-backslash version that means the same thing and reads worse.
 */
function escapeAttributeValue(value: string): string {
  let escaped = ''
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index] as string
    const next = value[index + 1]
    if (
      character === '\\' &&
      (next === undefined || next === '\\' || next === '"' || next === "'")
    ) {
      escaped += '\\\\'
      continue
    }
    escaped += character === '"' ? '\\"' : character
  }
  return escaped
}

/**
 * Locates the `{…}` attribute block surrounding the given attributes.
 *
 * Attribute nodes carry their own spans but not the block's, so the braces are found by
 * scanning outward. Returns undefined when the shape is unexpected, which leaves the
 * attributes untouched rather than guessing.
 */
function attributeBlock(
  source: string,
  attributes: readonly Attribute[],
): { readonly start: number; readonly end: number } | undefined {
  const first = attributes[0]
  const last = attributes[attributes.length - 1]
  if (first === undefined || last === undefined) {
    return undefined
  }

  let open = first.position.start.offset - 1
  while (open >= 0 && source[open] !== '{' && source[open] === ' ') {
    open -= 1
  }
  let close = last.position.end.offset
  while (close < source.length && source[close] !== '}' && source[close] === ' ') {
    close += 1
  }
  return source[open] === '{' && source[close] === '}' ? { start: open, end: close + 1 } : undefined
}

function collectEdits(root: Node, source: string): Edit[] {
  const edits: Edit[] = []

  visit(root, (node) => {
    if (node.type === 'interpolation') {
      edits.push({
        start: node.position.start.offset,
        end: node.position.end.offset,
        text: `{{ ${node.value} }}`,
      })
      return
    }

    if (
      node.type === 'containerDirective' ||
      node.type === 'leafDirective' ||
      node.type === 'textDirective'
    ) {
      if (node.attributes.length > 0) {
        const block = attributeBlock(source, node.attributes)
        if (block !== undefined) {
          const rendered = node.attributes
            .map((attribute) => formatAttribute(attribute, source))
            .join(' ')
          edits.push({ start: block.start, end: block.end, text: `{${rendered}}` })
        }
      }
    }
  })

  return edits
}

function applyEdits(source: string, edits: readonly Edit[]): string {
  const ordered = [...edits].sort((left, right) => right.start - left.start)
  let output = source
  let previousStart = source.length
  for (const edit of ordered) {
    // Overlapping edits would corrupt the document; skipping is the safe direction.
    if (edit.end > previousStart) {
      continue
    }
    output = output.slice(0, edit.start) + edit.text + output.slice(edit.end)
    previousStart = edit.start
  }
  return output
}

/** Removes trailing spaces and tabs from lines the formatter rewrote. */
function trimTouchedLines(formatted: string, original: string): string {
  const formattedLines = formatted.split('\n')
  const originalLines = original.split('\n')
  return formattedLines
    .map((line, index) => (line === originalLines[index] ? line : line.replace(/[ \t]+$/, '')))
    .join('\n')
}

/**
 * Formats HMX constructs in a document, leaving everything else byte-identical.
 *
 * Prose is never reflowed, list markers and emphasis are never rewritten, and frontmatter
 * keys are never reordered — see ADR-0015 for why a formatter that rewrites prose is a
 * formatter teams switch off. A document with parse errors is returned unchanged, because a
 * partially formatted broken file is worse than an unformatted one.
 */
function errorCount(diagnostics: readonly Diagnostic[]): number {
  return diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length
}

export function format(source: string, options: FormatOptions = {}): FormatResult {
  const from = options.from === undefined ? {} : { from: options.from }
  const parsed = parse(source, from)

  // Only well-formed documents are formatted. Fence repair was attempted here and removed:
  // under HMX1001 recovery a container's end offset points at the inner fence, so the tree
  // describes the broken parse and the rewrite silently widened the wrong line. Repairing
  // mis-nesting belongs in the diagnostic as a suggestion, not in a tool that rewrites files.
  if (parsed.diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    return { source, changed: false, diagnostics: parsed.diagnostics }
  }

  const edits = collectEdits(parsed.root, parsed.source)
  if (edits.length === 0) {
    return { source, changed: false, diagnostics: parsed.diagnostics }
  }

  const formatted = trimTouchedLines(applyEdits(parsed.source, edits), parsed.source)
  // Spans index the normalized source, so formatting happens there and the document's
  // original line endings are restored afterwards.
  const restored = source.includes('\r\n') ? formatted.replaceAll('\n', '\r\n') : formatted

  // Self-check. The repair is only accepted when reparsing shows it did not make the
  // document worse — a formatter that turns a warning into a broken file is a liability,
  // and this is cheaper than trying to prove the rewrite correct by inspection.
  const reparsed = parse(restored, from)
  if (errorCount(reparsed.diagnostics) > errorCount(parsed.diagnostics)) {
    return { source, changed: false, diagnostics: parsed.diagnostics }
  }

  return {
    source: restored,
    changed: restored !== source,
    diagnostics: reparsed.diagnostics,
  }
}
