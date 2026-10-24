// SPDX-License-Identifier: Apache-2.0
/**
 * SKILL.md frontmatter parsing for the dsh-eda-review bundle.
 *
 * Safety properties:
 * - pure text processing: no filesystem, network, child process, or eval;
 * - input size is bounded (MAX_FRONTMATTER_BYTES) before any parsing;
 * - `yaml` is used only when it resolves; otherwise a built-in parser handles
 *   the YAML subset used by DSH skill frontmatter. A missing `yaml` dependency
 *   therefore degrades gracefully instead of failing plugin startup.
 */

const MAX_FRONTMATTER_BYTES = 64 * 1024
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export const MAX_FRONTMATTER_LENGTH = MAX_FRONTMATTER_BYTES

let yamlParse = null
try {
  const mod = await import('yaml')
  if (typeof mod.parse === 'function') yamlParse = mod.parse
} catch {
  yamlParse = null
}

/**
 * Parse a SKILL.md document into a skill definition.
 *
 * @param {string} raw - full SKILL.md text
 * @param {string} [source] - diagnostic source label
 * @returns {{name: string, description: string, metadata?: object, invocation: {modelInvocable: boolean, userInvocable: boolean}, content: string} | undefined}
 */
export function parseSkillMarkdown(raw, source = 'SKILL.md') {
  return parseSkill(raw, source, parseYaml)
}

/**
 * Parse using only the built-in parser (deterministic fallback path).
 */
export function parseSkillMarkdownWithBuiltin(raw, source = 'SKILL.md') {
  return parseSkill(raw, source, parseYamlSubset)
}

function parseSkill(raw, source, parser) {
  const parsed = parseFrontmatter(raw, parser)
  if (parsed === undefined) return undefined

  const data = parsed.data
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return undefined

  const skillName = typeof data.name === 'string' ? data.name.trim() : ''
  if (skillName === '') throw new Error(`${source}: frontmatter requires a non-empty "name"`)
  if (!SKILL_NAME.test(skillName)) {
    throw new Error(`${source}: invalid skill name "${skillName}" (expected kebab-case, e.g. my-skill)`)
  }

  const description = typeof data.description === 'string' ? data.description.trim() : ''
  if (description === '') throw new Error(`${source}: frontmatter requires a non-empty "description"`)

  const metadata =
    data.metadata !== null && typeof data.metadata === 'object' && !Array.isArray(data.metadata)
      ? data.metadata
      : undefined

  return {
    name: skillName,
    description,
    ...(metadata === undefined ? {} : { metadata }),
    invocation: {
      modelInvocable: data['disable-model-invocation'] !== true,
      userInvocable: data['user-invocable'] !== false,
    },
    content: parsed.body.trim(),
  }
}

function parseFrontmatter(raw, parser) {
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw
  const firstLineEnd = text.indexOf('\n')
  if (firstLineEnd < 0) return undefined
  if (text.slice(0, firstLineEnd).replace(/\r$/, '') !== '---') return undefined

  const closing = findClosingDelimiter(text, firstLineEnd + 1)
  if (closing === undefined) return undefined

  const frontmatter = text.slice(firstLineEnd + 1, closing.start)
  if (Buffer.byteLength(frontmatter, 'utf8') > MAX_FRONTMATTER_BYTES) {
    throw new Error(`frontmatter exceeds ${MAX_FRONTMATTER_BYTES} bytes`)
  }

  return { data: parser(frontmatter), body: text.slice(closing.bodyStart) }
}

function findClosingDelimiter(text, start) {
  let lineStart = start
  while (lineStart <= text.length) {
    const newline = text.indexOf('\n', lineStart)
    const lineEnd = newline < 0 ? text.length : newline
    if (text.slice(lineStart, lineEnd).replace(/\r$/, '') === '---') {
      return { start: lineStart, bodyStart: newline < 0 ? text.length : newline + 1 }
    }
    if (newline < 0) return undefined
    lineStart = newline + 1
  }
  return undefined
}

function parseYaml(source) {
  if (yamlParse !== null) {
    try {
      return yamlParse(source)
    } catch {
      // Fall through: keep the plugin loadable with the built-in parser.
    }
  }
  return parseYamlSubset(source)
}

function parseYamlSubset(source) {
  const lines = source.split(/\r?\n/)
  const root = {}
  const stack = [{ indent: -1, container: root }]
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    index += 1

    if (line.trim() === '' || line.trimStart().startsWith('#')) continue
    if (/^[ ]*\t/.test(line)) {
      throw new Error('frontmatter: tab indentation is not supported')
    }

    const indent = line.length - line.trimStart().length
    const content = line.trimStart()

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop()
    const container = stack[stack.length - 1].container

    const keyMatch = /^([A-Za-z0-9_][A-Za-z0-9_.\-]*)\s*:(?:[ \t]+(.*))?$/.exec(content)
    if (keyMatch === null) {
      throw new Error(`frontmatter: unsupported YAML construct at line ${index}: ${JSON.stringify(content)}`)
    }

    const key = keyMatch[1]
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      throw new Error(`frontmatter: reserved key "${key}" is not allowed`)
    }
    const rest = (keyMatch[2] ?? '').trim()

    if (rest === '|' || rest === '>' || /^[|>][+-]$/.test(rest)) {
      const collected = collectBlockScalar(lines, index, indent)
      index = collected.nextIndex
      container[key] = buildBlockScalar(collected.lines, rest)
      continue
    }

    if (rest === '') {
      const next = nextContentLine(lines, index)
      if (next !== undefined && next.indent > indent) {
        const child = {}
        container[key] = child
        stack.push({ indent, container: child })
        continue
      }
      container[key] = null
      continue
    }

    container[key] = parseScalar(rest)
  }

  return root
}

function collectBlockScalar(lines, start, baseIndent) {
  const collected = []
  let index = start

  while (index < lines.length) {
    const line = lines[index]
    if (line.trim() === '') {
      collected.push('')
      index += 1
      continue
    }
    const indent = line.length - line.trimStart().length
    if (indent <= baseIndent) break
    collected.push(line)
    index += 1
  }

  while (collected.length > 0 && collected[collected.length - 1] === '') collected.pop()
  return { lines: collected, nextIndex: index }
}

function buildBlockScalar(lines, indicator) {
  const nonEmpty = lines.filter((line) => line.trim() !== '')
  const strip = nonEmpty.length > 0 ? Math.min(...nonEmpty.map((line) => line.length - line.trimStart().length)) : 0
  const normalized = lines.map((line) => (line.trim() === '' ? '' : line.slice(strip)))
  const folded = indicator.startsWith('>')
  let value = folded ? foldLines(normalized) : normalized.join('\n')
  if (!indicator.endsWith('-')) value += '\n'
  return value
}

function foldLines(lines) {
  const parts = []
  let buffer = []
  const flush = () => {
    if (buffer.length > 0) {
      parts.push(buffer.join(' '))
      buffer = []
    }
  }
  for (const line of lines) {
    if (line.trim() === '') {
      flush()
      parts.push('\n')
    } else {
      buffer.push(line.trim())
    }
  }
  flush()
  return parts.join('')
}

function nextContentLine(lines, from) {
  for (let index = from; index < lines.length; index += 1) {
    const line = lines[index]
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    return { line, index, indent: line.length - line.trimStart().length }
  }
  return undefined
}

function parseScalar(text) {
  const value = text.trim()
  if (value === '' || value.startsWith('#')) return null

  if (value.startsWith('{') || value.startsWith('[')) {
    throw new Error(`frontmatter: flow collections are not supported by the built-in parser: ${JSON.stringify(value)}`)
  }

  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  }
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/g, "'")
  }

  if (value === 'true') return true
  if (value === 'false') return false
  if (value === 'null' || value === '~') return null
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) return Number(value)

  const comment = value.indexOf(' #')
  return (comment < 0 ? value : value.slice(0, comment)).trim()
}
