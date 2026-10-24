import test from 'node:test'
import assert from 'node:assert/strict'
import { parseSkillMarkdown, parseSkillMarkdownWithBuiltin } from '../lib/frontmatter.mjs'

let yamlOk = false
try {
  await import('yaml')
  yamlOk = true
} catch {
  yamlOk = false
}

// Differential precision harness.
//
// A seeded generator builds valid DSH frontmatter documents whose expected
// parse result is known by construction. The measured "precision error" is the
// share of corpus cases where the parser result differs from the expectation.
// The gate is strict: error rate must stay below 5% (the contract asks for <5%;
// this suite expects 0 and fails on any regression beyond that gate).

const CASE_COUNT = 300
const ERROR_RATE_LIMIT = 0.05
const TIME_LIMIT_MS = 2000

const WORDS = [
  'alpha', 'beta', 'gamma', 'delta', 'netlist', 'pcb', 'gnd', 'vcc', 'trace', 'pad',
  '嘉立创', '审查', '网表', '封装', '焊盘',
]

function mulberry32(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick(rng, list) {
  return list[Math.floor(rng() * list.length)]
}

function phrase(rng) {
  const length = 1 + Math.floor(rng() * 3)
  return Array.from({ length }, () => pick(rng, WORDS)).join(' ')
}

function buildCase(rng, index) {
  const name = `skill-${String(index).padStart(3, '0')}`
  const style = pick(rng, ['plain', 'single', 'double', 'literal', 'folded'])
  const lines = Array.from({ length: 1 + Math.floor(rng() * 3) }, () => phrase(rng))

  let frontmatter = `name: ${name}\n`
  let description
  if (style === 'plain') {
    description = lines.join(' ')
    frontmatter += `description: ${description}\n`
  } else if (style === 'single') {
    description = lines.join(' ')
    frontmatter += `description: '${description}'\n`
  } else if (style === 'double') {
    description = lines.join(' ')
    frontmatter += `description: "${description}"\n`
  } else if (style === 'literal') {
    description = lines.join('\n')
    frontmatter += 'description: |\n' + lines.map((line) => `  ${line}`).join('\n') + '\n'
  } else {
    description = lines.join(' ')
    frontmatter += 'description: >\n' + lines.map((line) => `  ${line}`).join('\n') + '\n'
  }

  let metadata
  if (rng() < 0.4) {
    metadata = { type: pick(rng, ['skill', 'tool', 'reference']), level: Math.floor(rng() * 10) }
    frontmatter += 'metadata:\n'
    frontmatter += `  type: ${metadata.type}\n`
    frontmatter += `  level: ${metadata.level}\n`
    if (rng() < 0.4) {
      const inner = pick(rng, WORDS)
      metadata.group = { inner }
      frontmatter += `  group:\n    inner: ${inner}\n`
    }
  }

  const disableModel = rng() < 0.2
  if (disableModel) frontmatter += 'disable-model-invocation: true\n'
  const userInvocable = rng() > 0.15
  if (!userInvocable) frontmatter += 'user-invocable: false\n'

  const body = `body-${index}`
  return {
    text: `---\n${frontmatter}---\n${body}`,
    expected: {
      name,
      description,
      metadata: metadata ?? null,
      modelInvocable: !disableModel,
      userInvocable,
      content: body,
    },
  }
}

function compare(skill, expected) {
  if (skill === undefined || skill === null) return 'skill is undefined'
  if (skill.name !== expected.name) return `name ${JSON.stringify(skill.name)} != ${JSON.stringify(expected.name)}`
  if (skill.description !== expected.description) return 'description mismatch'
  if (JSON.stringify(skill.metadata ?? null) !== JSON.stringify(expected.metadata)) return 'metadata mismatch'
  if (skill.invocation.modelInvocable !== expected.modelInvocable) return 'modelInvocable mismatch'
  if (skill.invocation.userInvocable !== expected.userInvocable) return 'userInvocable mismatch'
  if (skill.content !== expected.content) return 'content mismatch'
  return null
}

const rng = mulberry32(20261025)
const corpus = Array.from({ length: CASE_COUNT }, (_, index) => buildCase(rng, index))

test('differential: measured error rate stays below 5%', () => {
  const startedAt = performance.now()
  const mismatches = []
  for (const [index, item] of corpus.entries()) {
    let skill
    try {
      skill = parseSkillMarkdownWithBuiltin(item.text, `case-${index}.md`)
    } catch (error) {
      mismatches.push({ index, reason: `threw: ${error.message}` })
      continue
    }
    const reason = compare(skill, item.expected)
    if (reason !== null) mismatches.push({ index, reason })
  }
  const durationMs = performance.now() - startedAt
  const rate = mismatches.length / corpus.length
  console.log(
    `differential: ${corpus.length} cases, ${mismatches.length} mismatches, ` +
      `error rate ${(rate * 100).toFixed(2)}%, ${durationMs.toFixed(1)} ms`,
  )
  for (const mismatch of mismatches.slice(0, 5)) {
    console.log(`  case ${mismatch.index}: ${mismatch.reason}`)
  }
  assert.ok(rate < ERROR_RATE_LIMIT, `error rate ${(rate * 100).toFixed(2)}% must be below 5%`)
  assert.ok(durationMs < TIME_LIMIT_MS, `corpus parse must stay under ${TIME_LIMIT_MS} ms`)
})

test('differential: repeated runs are deterministic', () => {
  const first = corpus.map((item) => JSON.stringify(parseSkillMarkdownWithBuiltin(item.text)))
  const second = corpus.map((item) => JSON.stringify(parseSkillMarkdownWithBuiltin(item.text)))
  assert.deepEqual(first, second)
})

test(
  'differential: auto parser (yaml) agrees with builtin within 5% when available',
  { skip: yamlOk ? false : 'yaml dependency is not resolvable in this environment' },
  () => {
    let diverged = 0
    for (const item of corpus) {
      const auto = stable(parseSkillMarkdown(item.text))
      const builtin = stable(parseSkillMarkdownWithBuiltin(item.text))
      if (JSON.stringify(auto) !== JSON.stringify(builtin)) diverged += 1
    }
    const rate = diverged / corpus.length
    console.log(`differential(yaml vs builtin): ${diverged} diverged, ${(rate * 100).toFixed(2)}%`)
    assert.ok(rate < ERROR_RATE_LIMIT)
  },
)

function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stable(value[key])]),
    )
  }
  return value
}
