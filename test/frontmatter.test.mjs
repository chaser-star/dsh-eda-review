import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  parseSkillMarkdown,
  parseSkillMarkdownWithBuiltin,
  MAX_FRONTMATTER_LENGTH,
} from '../lib/frontmatter.mjs'
import { apply, name, inject } from '../index.js'

const skillUrl = new URL('../skills/eda-project-review/SKILL.md', import.meta.url)

test('bundled skill parses and keeps review content', async () => {
  const raw = await readFile(skillUrl, 'utf8')
  const skill = parseSkillMarkdown(raw, skillUrl.pathname)
  assert.ok(skill)
  assert.equal(skill.name, 'eda-project-review')
  assert.match(skill.description, /嘉立创EDA/)
  assert.match(skill.content, /权威网表/)
  assert.equal(skill.invocation.modelInvocable, true)
  assert.equal(skill.invocation.userInvocable, true)
})

test('builtin parser agrees with the configured parser on the bundled skill', async () => {
  const raw = await readFile(skillUrl, 'utf8')
  const auto = parseSkillMarkdown(raw, skillUrl.pathname)
  const builtin = parseSkillMarkdownWithBuiltin(raw, skillUrl.pathname)
  assert.deepEqual(builtin, auto)
})

test('literal block scalar keeps line breaks', () => {
  const skill = parseSkillMarkdownWithBuiltin(
    '---\nname: sample-skill\ndescription: |\n  First line.\n  Second line.\n---\nbody\n',
  )
  assert.equal(skill.description, 'First line.\nSecond line.')
})

test('folded block scalar joins lines', () => {
  const skill = parseSkillMarkdownWithBuiltin(
    '---\nname: sample-skill\ndescription: >\n  First line.\n  Second line.\n---\n',
  )
  assert.equal(skill.description, 'First line. Second line.')
})

test('CRLF frontmatter is accepted', () => {
  const skill = parseSkillMarkdownWithBuiltin('---\r\nname: sample-skill\r\ndescription: ok\r\n---\r\nbody\r\n')
  assert.equal(skill.name, 'sample-skill')
  assert.equal(skill.content, 'body')
})

test('missing frontmatter yields undefined', () => {
  assert.equal(parseSkillMarkdownWithBuiltin('just text'), undefined)
})

test('invalid skill name is rejected', () => {
  assert.throws(
    () => parseSkillMarkdownWithBuiltin('---\nname: Bad_Name\ndescription: x\n---\n'),
    /invalid skill name/,
  )
})

test('oversized frontmatter is rejected', () => {
  const huge = '---\nname: x-skill\ndescription: ' + 'a'.repeat(MAX_FRONTMATTER_LENGTH + 16) + '\n---\n'
  assert.throws(() => parseSkillMarkdownWithBuiltin(huge), /exceeds/)
})

test('metadata mapping and invocation flags are honored', () => {
  const skill = parseSkillMarkdownWithBuiltin(
    '---\nname: meta-skill\ndescription: d\nmetadata:\n  type: skill\n  source: local\nuser-invocable: false\ndisable-model-invocation: true\n---\nbody\n',
  )
  assert.deepEqual(skill.metadata, { type: 'skill', source: 'local' })
  assert.equal(skill.invocation.userInvocable, false)
  assert.equal(skill.invocation.modelInvocable, false)
})

test('apply registers a provider that lists and returns the bundled skill', async () => {
  assert.equal(name, 'dsh-eda-review')
  assert.ok(Array.isArray(inject) && inject.includes('skills'))

  const registrations = []
  const ctx = { skills: { registerProvider(factory) { registrations.push(factory) } } }
  apply(ctx)
  assert.equal(registrations.length, 1)

  const provider = registrations[0]()
  assert.equal(provider.name, 'dsh-eda-review')

  const listed = await provider.list({})
  const entry = listed.find((item) => item.name === 'eda-project-review')
  assert.ok(entry)
  assert.equal(entry.rank, 500)
  assert.ok(entry.resourceBase.path.includes('eda-project-review'))

  const definition = await provider.get({ name: 'eda-project-review' }, {})
  assert.match(definition.content, /权威网表/)

  assert.equal(await provider.get({ name: 'missing-skill' }, {}), undefined)
  assert.equal(await provider.get({}, {}), undefined)
})

test('provider honors an already-aborted signal', async () => {
  const ctx = { skills: { registerProvider(factory) { ctx.provider = factory() } } }
  apply(ctx)
  await assert.rejects(ctx.provider.list({ signal: AbortSignal.abort() }), /abort/i)
})
