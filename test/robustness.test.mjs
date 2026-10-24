import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply, loadSkillsFrom } from '../index.js'
import { parseSkillMarkdownWithBuiltin } from '../lib/frontmatter.mjs'

const SKILL_FRONTMATTER = (name) => `name: ${name}\ndescription: description of ${name}`

async function withTempRoot(fn) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-eda-review-'))
  try {
    return await fn(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

async function writeSkill(root, directory, frontmatter, body = 'body') {
  const dir = join(root, directory)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'SKILL.md'), `---\n${frontmatter}\n---\n${body}`, 'utf8')
}

function bundledProvider() {
  const ctx = { skills: { registerProvider(factory) { ctx.provider = factory() } } }
  apply(ctx)
  return ctx.provider
}

test('loader: 50 skills load, sorted, non-skill entries ignored', async () => {
  await withTempRoot(async (root) => {
    for (let index = 0; index < 50; index += 1) {
      const name = `skill-${String(index).padStart(2, '0')}`
      await writeSkill(root, name, SKILL_FRONTMATTER(name))
    }
    await mkdir(join(root, 'without-skill-md'), { recursive: true })
    await writeFile(join(root, 'plain.txt'), 'not a skill', 'utf8')

    const skills = await loadSkillsFrom(root)
    assert.equal(skills.length, 50)
    const names = skills.map((skill) => skill.name)
    assert.deepEqual(names, [...names].sort())
  })
})

test('loader: a directory without SKILL.md does not break listing', async () => {
  await withTempRoot(async (root) => {
    await writeSkill(root, 'good-skill', SKILL_FRONTMATTER('good-skill'))
    await mkdir(join(root, 'empty-dir'), { recursive: true })
    const skills = await loadSkillsFrom(root)
    assert.deepEqual(skills.map((skill) => skill.name), ['good-skill'])
  })
})

test('loader: empty root yields an empty list', async () => {
  await withTempRoot(async (root) => {
    assert.deepEqual(await loadSkillsFrom(root), [])
  })
})

test('loader: invalid skill fails loudly with the file path', async () => {
  await withTempRoot(async (root) => {
    await writeSkill(root, 'broken', 'name: Bad_Name\ndescription: d')
    await assert.rejects(loadSkillsFrom(root), /invalid skill name/)
  })
})

test('loader: SKILL.md over 1 MiB is rejected', async () => {
  await withTempRoot(async (root) => {
    const dir = join(root, 'huge-skill')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'SKILL.md'), 'x'.repeat(1024 * 1024 + 16), 'utf8')
    await assert.rejects(loadSkillsFrom(root), /exceeds/)
  })
})

test('loader: symlinked skill directory is supported when the OS allows it', async (t) => {
  await withTempRoot(async (root) => {
    const target = join(root, 'real-skill')
    await mkdir(target, { recursive: true })
    await writeFile(join(target, 'SKILL.md'), '---\nname: linked-skill\ndescription: d\n---\nbody', 'utf8')
    try {
      await symlink(target, join(root, 'linked-skill'), 'junction')
    } catch (error) {
      t.skip(`symlink unavailable: ${error.code ?? error.message}`)
      return
    }
    const skills = await loadSkillsFrom(root)
    assert.ok(skills.some((skill) => skill.name === 'linked-skill'))
  })
})

test('safety: reserved keys cannot pollute Object.prototype', () => {
  assert.throws(
    () => parseSkillMarkdownWithBuiltin('---\nname: my-skill\ndescription: d\n__proto__: {"polluted": true}\n---\n'),
    /reserved key/,
  )
  assert.equal({}.polluted, undefined)
  assert.equal(Object.getPrototypeOf({}).polluted, undefined)
})

test('robustness: YAML anchors and aliases degrade to plain strings', () => {
  const skill = parseSkillMarkdownWithBuiltin(
    '---\nname: my-skill\ndescription: d\nmetadata:\n  a: &anchor value\n  b: *anchor\n---\nbody',
  )
  assert.equal(skill.metadata.a, '&anchor value')
  assert.equal(skill.metadata.b, '*anchor')
})

test('provider: parallel list/get calls stay consistent', async () => {
  const provider = bundledProvider()
  const lists = await Promise.all(Array.from({ length: 25 }, () => provider.list({})))
  assert.equal(new Set(lists.map((list) => list.length)).size, 1)
  const gets = await Promise.all(
    Array.from({ length: 25 }, () => provider.get({ name: 'eda-project-review' }, {})),
  )
  assert.equal(new Set(gets.map((definition) => definition.content)).size, 1)
})

test('provider: repeated listings are deterministic', async () => {
  const provider = bundledProvider()
  const first = JSON.stringify(await provider.list({}))
  const second = JSON.stringify(await provider.list({}))
  assert.equal(first, second)
})

test('provider: unknown candidate shapes return undefined', async () => {
  const provider = bundledProvider()
  assert.equal(await provider.get(undefined, {}), undefined)
  assert.equal(await provider.get('eda-project-review', {}), undefined)
  assert.equal(await provider.get({ name: null }, {}), undefined)
  assert.equal(await provider.get({ name: 123 }, {}), undefined)
  assert.equal(await provider.get({ name: '' }, {}), undefined)
})

test('provider: candidate shape exposes rank, source and resource base', async () => {
  const entry = (await bundledProvider().list({})).find((item) => item.name === 'eda-project-review')
  assert.equal(entry.rank, 500)
  assert.equal(entry.source, 'bundled')
  assert.equal(entry.resourceBase.kind, 'directory')
  assert.ok(entry.path.endsWith('SKILL.md'))
})

test('provider: separate registrations do not share state', () => {
  const first = { skills: { registerProvider(factory) { first.provider = factory() } } }
  const second = { skills: { registerProvider(factory) { second.provider = factory() } } }
  apply(first)
  apply(second)
  assert.equal(first.provider.name, 'dsh-eda-review')
  assert.equal(second.provider.name, 'dsh-eda-review')
  assert.notEqual(first.provider, second.provider)
})

test('safety invariants: shipped sources have no network, shell or eval', async () => {
  for (const file of ['index.js', 'lib/frontmatter.mjs']) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /child_process/)
    assert.doesNotMatch(source, /\bfetch\s*\(/)
    assert.doesNotMatch(source, /\beval\s*\(/)
    assert.doesNotMatch(source, /new Function/)
    assert.doesNotMatch(source, /https?:\/\//)
  }
})

test('safety invariants: no install-time lifecycle scripts', async () => {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  const scripts = Object.keys(manifest.scripts ?? {})
  const lifecycle = scripts.filter((name) => ['preinstall', 'install', 'postinstall', 'prepare'].includes(name))
  assert.deepEqual(lifecycle, [])
})
