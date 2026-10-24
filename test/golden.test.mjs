import test from 'node:test'
import assert from 'node:assert/strict'
import { parseSkillMarkdown, parseSkillMarkdownWithBuiltin } from '../lib/frontmatter.mjs'

// Golden corpus: every frontmatter construct the parser claims to support,
// plus every documented failure mode. Each case is independent of the
// environment (no yaml dependency required).

function parse(frontmatter, body = 'body') {
  return parseSkillMarkdownWithBuiltin(`---\n${frontmatter}\n---\n${body}`)
}

const scalarCases = [
  ['plain scalars', 'name: my-skill\ndescription: Hello world', 'Hello world'],
  ['single quoted', "name: my-skill\ndescription: 'hello world'", 'hello world'],
  ['double quoted with escape', 'name: my-skill\ndescription: "hello \\"quoted\\" world"', 'hello "quoted" world'],
  ['colon inside plain value', 'name: my-skill\ndescription: a: b', 'a: b'],
  ['trailing spaces trimmed', 'name: my-skill\ndescription: value   ', 'value'],
  ['inline comment stripped', 'name: my-skill\ndescription: value # note', 'value'],
  ['unicode content', 'name: my-skill\ndescription: 嘉立创 EDA 审查 🔍', '嘉立创 EDA 审查 🔍'],
]

for (const [label, frontmatter, expected] of scalarCases) {
  test(`golden scalar: ${label}`, () => {
    assert.equal(parse(frontmatter).description, expected)
  })
}

const blockCases = [
  ['literal', 'name: my-skill\ndescription: |\n  one\n  two', 'one\ntwo'],
  ['literal keeps blank line', 'name: my-skill\ndescription: |\n  one\n\n  two', 'one\n\ntwo'],
  ['literal strip', 'name: my-skill\ndescription: |-\n  one\n  two', 'one\ntwo'],
  ['folded joins', 'name: my-skill\ndescription: >\n  one\n  two', 'one two'],
  ['folded blank line becomes newline', 'name: my-skill\ndescription: >\n  one\n\n  two', 'one\ntwo'],
]

for (const [label, frontmatter, expected] of blockCases) {
  test(`golden block: ${label}`, () => {
    assert.equal(parse(frontmatter).description, expected)
  })
}

test('golden metadata: nested mapping', () => {
  const skill = parse('name: my-skill\ndescription: d\nmetadata:\n  type: skill\n  group:\n    inner: 2')
  assert.deepEqual(skill.metadata, { type: 'skill', group: { inner: 2 } })
})

test('golden metadata: scalar types', () => {
  const skill = parse(
    'name: my-skill\ndescription: d\nmetadata:\n  flag: true\n  off: false\n  ratio: 1.5\n  empty: null\n  label: text',
  )
  assert.deepEqual(skill.metadata, { flag: true, off: false, ratio: 1.5, empty: null, label: 'text' })
})

test('golden metadata: block scalar value', () => {
  const skill = parse('name: my-skill\ndescription: d\nmetadata:\n  note: |\n    a\n    b')
  assert.equal(skill.metadata.note, 'a\nb\n')
})

test('golden metadata: non-object metadata is ignored', () => {
  assert.equal(parse('name: my-skill\ndescription: d\nmetadata: 5').metadata, undefined)
})

test('golden metadata: dotted keys', () => {
  const skill = parse('name: my-skill\ndescription: d\nmetadata:\n  a.b: c')
  assert.deepEqual(skill.metadata, { 'a.b': 'c' })
})

test('golden invocation: defaults are model and user invocable', () => {
  assert.deepEqual(parse('name: my-skill\ndescription: d').invocation, {
    modelInvocable: true,
    userInvocable: true,
  })
})

test('golden invocation: disable-model-invocation', () => {
  const skill = parse('name: my-skill\ndescription: d\ndisable-model-invocation: true')
  assert.deepEqual(skill.invocation, { modelInvocable: false, userInvocable: true })
})

test('golden invocation: user-invocable false', () => {
  const skill = parse('name: my-skill\ndescription: d\nuser-invocable: false')
  assert.deepEqual(skill.invocation, { modelInvocable: true, userInvocable: false })
})

test('golden invocation: both flags off', () => {
  const skill = parse('name: my-skill\ndescription: d\ndisable-model-invocation: true\nuser-invocable: false')
  assert.deepEqual(skill.invocation, { modelInvocable: false, userInvocable: false })
})

test('golden content: trimmed body', () => {
  assert.equal(parse('name: my-skill\ndescription: d', '\n\nbody text\n\n').content, 'body text')
})

test('golden content: internal blank lines preserved', () => {
  assert.equal(parse('name: my-skill\ndescription: d', 'a\n\nb').content, 'a\n\nb')
})

test('golden: duplicate keys, last one wins', () => {
  assert.equal(parse('name: first-skill\nname: second-skill\ndescription: d').name, 'second-skill')
})

test('golden: digits in kebab name are allowed', () => {
  assert.equal(parse('name: dsh-eda-review2\ndescription: d').name, 'dsh-eda-review2')
})

test('golden: CRLF input', () => {
  const skill = parseSkillMarkdownWithBuiltin('---\r\nname: my-skill\r\ndescription: ok\r\n---\r\nbody\r\n')
  assert.equal(skill.description, 'ok')
  assert.equal(skill.content, 'body')
})

test('golden: UTF-8 BOM is tolerated', () => {
  const skill = parseSkillMarkdownWithBuiltin('\uFEFF---\nname: my-skill\ndescription: ok\n---\nbody')
  assert.equal(skill.name, 'my-skill')
})

test('golden: no frontmatter yields undefined', () => {
  assert.equal(parseSkillMarkdownWithBuiltin('plain text'), undefined)
})

test('golden: unterminated frontmatter yields undefined', () => {
  assert.equal(parseSkillMarkdownWithBuiltin('---\nname: my-skill\ndescription: d'), undefined)
})

const errorCases = [
  ['missing name', 'description: d', /name/],
  ['empty name', 'name: ""\ndescription: d', /name/],
  ['invalid name (uppercase)', 'name: Bad_Name\ndescription: d', /invalid skill name/],
  ['invalid name (underscore)', 'name: bad_name\ndescription: d', /invalid skill name/],
  ['missing description', 'name: my-skill', /description/],
  ['sequence payload', '- a\n- b', /unsupported/],
  ['flow mapping', 'name: my-skill\ndescription: d\nmetadata: {a: 1}', /flow collections/],
  ['tab indentation', 'name: my-skill\ndescription: d\nmetadata:\n\tkey: v', /tab indentation/],
  ['reserved key', 'name: my-skill\ndescription: d\n__proto__: x', /reserved key/],
]

for (const [label, frontmatter, pattern] of errorCases) {
  test(`golden error: ${label}`, () => {
    assert.throws(() => parse(frontmatter), pattern)
  })
}

test('golden: auto parser agrees with builtin on every pass case', () => {
  const passing = [...scalarCases, ...blockCases].map(([, frontmatter]) => frontmatter)
  passing.push(
    'name: my-skill\ndescription: d\nmetadata:\n  type: skill\n  group:\n    inner: 2',
    'name: my-skill\ndescription: d\ndisable-model-invocation: true\nuser-invocable: false',
  )
  for (const frontmatter of passing) {
    const raw = `---\n${frontmatter}\n---\nbody`
    assert.deepEqual(parseSkillMarkdown(raw), parseSkillMarkdownWithBuiltin(raw))
  }
})
