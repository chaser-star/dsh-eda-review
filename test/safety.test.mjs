// SPDX-License-Identifier: Apache-2.0
import test from 'node:test'
import assert from 'node:assert/strict'
import { parseSkillMarkdown, parseSkillMarkdownWithBuiltin } from '../lib/frontmatter.mjs'
import { apply } from '../index.js'

// Safety, boundary, and fault cases for the bundled frontmatter parser.
// All cases use in-memory text; nothing here reads user files or writes state.

test('malformed YAML frontmatter is rejected, never executed', () => {
  assert.throws(
    () => parseSkillMarkdownWithBuiltin('---\nname: x-skill\n- item\n---\n'),
    /unsupported/i,
  )
})

test('flow collections are rejected by the builtin parser', () => {
  assert.throws(
    () => parseSkillMarkdownWithBuiltin('---\nname: x-skill\ndescription: {a: 1}\n---\n'),
    /flow collections/i,
  )
})

test('frontmatter byte bomb beyond the cap is rejected', () => {
  const bomb = '---\nname: x-skill\ndescription: ' + 'x'.repeat(70 * 1024) + '\n---\n'
  assert.throws(() => parseSkillMarkdownWithBuiltin(bomb), /exceeds/i)
})

test('unterminated frontmatter yields undefined instead of throwing', () => {
  assert.equal(parseSkillMarkdownWithBuiltin('---\nname: x-skill\ndescription: no closing marker\n'), undefined)
})

test('empty description is rejected', () => {
  assert.throws(() => parseSkillMarkdownWithBuiltin('---\nname: x-skill\ndescription: ""\n---\n'), /description/i)
})

test('non-object frontmatter payload is rejected', () => {
  assert.throws(
    () => parseSkillMarkdownWithBuiltin('---\n- just a list\n---\n'),
    /unsupported/i,
  )
})

test('candidate without a valid name never reaches skill content', async () => {
  const ctx = { skills: { registerProvider(factory) { ctx.provider = factory() } } }
  apply(ctx)
  assert.equal(await ctx.provider.get({ name: 42 }, {}), undefined)
  assert.equal(await ctx.provider.get(null, {}), undefined)
})

test('aborted list call rejects early (cancellation boundary)', async () => {
  const ctx = { skills: { registerProvider(factory) { ctx.provider = factory() } } }
  apply(ctx)
  const signal = AbortSignal.abort()
  await assert.rejects(ctx.provider.list({ signal }), /abort/i)
  await assert.rejects(ctx.provider.get({ name: 'eda-project-review' }, { signal }), /abort/i)
})

test('auto and builtin parsers agree on adversarial input', () => {
  const sketchy = '---\nname: sketchy-skill\ndescription: |\n  line with: colon\n  line with # hash\n---\nbody\n'
  const auto = parseSkillMarkdown(sketchy)
  const builtin = parseSkillMarkdownWithBuiltin(sketchy)
  assert.equal(auto.name, 'sketchy-skill')
  assert.equal(builtin.name, 'sketchy-skill')
})
