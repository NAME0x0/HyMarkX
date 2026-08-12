import type { CompileContext, Extension, Handle, Token } from 'mdast-util-from-markdown'
import { frontmatter } from 'micromark-extension-frontmatter'
import { SourcePositions } from './positions.js'

type MdastCompatibleNode = Parameters<CompileContext['enter']>[0]

interface YamlDraft {
  type: 'yaml'
  value: string
}

function yamlNode(context: CompileContext): YamlDraft {
  const node = context.stack[context.stack.length - 1] as Partial<YamlDraft> | undefined
  if (node?.type !== 'yaml') {
    throw new TypeError('Expected an open YAML frontmatter node')
  }
  return node as YamlDraft
}

function rawValue(token: Token, positions: SourcePositions): string {
  const openingLineEnd = positions.source.indexOf('\n', token.start.offset)
  const closingLineStart = positions.source.lastIndexOf('\n', token.end.offset - 1) + 1
  if (openingLineEnd < token.start.offset || closingLineStart <= openingLineEnd) {
    throw new TypeError('Unexpected YAML frontmatter token shape')
  }

  const valueStart = openingLineEnd + 1
  const valueEnd = Math.max(valueStart, closingLineStart - 1)
  return positions.source.slice(valueStart, valueEnd)
}

/** Creates the YAML-only, document-start frontmatter tokenizer. */
export function frontmatterTokenizer(): ReturnType<typeof frontmatter> {
  return frontmatter('yaml')
}

/** Creates the HMX-owned mdast handler that retains raw frontmatter text. */
export function frontmatterFromMarkdown(positions: SourcePositions): Extension {
  const enterYaml: Handle = function (token) {
    const node: YamlDraft = { type: 'yaml', value: '' }
    this.enter(node as unknown as MdastCompatibleNode, token)
  }
  const exitYaml: Handle = function (token) {
    yamlNode(this).value = rawValue(token, positions)
    this.exit(token)
  }

  return { enter: { yaml: enterYaml }, exit: { yaml: exitYaml } }
}
