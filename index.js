/**
 * dsh-eda-review — read-only DSH Skill bundle.
 *
 * Registers the packaged skills/eda-project-review/SKILL.md on ctx.skills.
 * Safety posture: no writes, no network, no child processes, no eval, and no
 * lifecycle scripts. The only I/O is reading bundled SKILL.md files.
 */

import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSkillMarkdown } from './lib/frontmatter.mjs'

const BUNDLED_SKILL_RANK = 500
const PROVIDER_NAME = 'dsh-eda-review'
const SKILLS_ROOT = fileURLToPath(new URL('./skills/', import.meta.url))
const MAX_SKILL_FILE_BYTES = 1024 * 1024

export const name = PROVIDER_NAME
export const inject = ['skills']

export function apply(ctx) {
  ctx.skills.registerProvider(() => ({
    name: PROVIDER_NAME,
    async list(options) {
      options?.signal?.throwIfAborted()
      const skills = await loadSkills(options?.signal)
      options?.signal?.throwIfAborted()
      return skills.map(toCandidate)
    },
    async get(candidate, options) {
      options?.signal?.throwIfAborted()
      if (candidate === null || typeof candidate !== 'object' || typeof candidate.name !== 'string') {
        return undefined
      }
      const skills = await loadSkills(options?.signal)
      const skill = skills.find((entry) => entry.name === candidate.name)
      return skill === undefined ? undefined : toDefinition(skill)
    },
  }))
}

async function loadSkills(signal) {
  const entries = await readdir(SKILLS_ROOT, { withFileTypes: true })
  const skills = []

  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
    signal?.throwIfAborted()

    const directory = join(SKILLS_ROOT, entry.name)
    const skillFile = join(directory, 'SKILL.md')
    const raw = await readFile(skillFile, 'utf8')

    if (Buffer.byteLength(raw, 'utf8') > MAX_SKILL_FILE_BYTES) {
      throw new Error(`${PROVIDER_NAME}: ${skillFile} exceeds ${MAX_SKILL_FILE_BYTES} bytes`)
    }

    let parsed
    try {
      parsed = parseSkillMarkdown(raw, skillFile)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`${PROVIDER_NAME}: ${skillFile}: ${message}`)
    }
    if (parsed === undefined) continue

    skills.push(buildSkill(parsed, directory, skillFile))
  }

  return skills.sort((left, right) => left.name.localeCompare(right.name))
}

function buildSkill(parsed, directory, skillFile) {
  return {
    name: parsed.name,
    description: parsed.description,
    ...(parsed.metadata === undefined ? {} : { metadata: parsed.metadata }),
    invocation: parsed.invocation,
    provider: PROVIDER_NAME,
    source: 'bundled',
    resourceBase: { kind: 'directory', path: directory },
    rank: BUNDLED_SKILL_RANK,
    locator: skillFile,
    path: skillFile,
    content: parsed.content,
  }
}

function toCandidate(skill) {
  return {
    name: skill.name,
    description: skill.description,
    ...(skill.metadata === undefined ? {} : { metadata: skill.metadata }),
    invocation: skill.invocation,
    provider: skill.provider,
    source: skill.source,
    resourceBase: skill.resourceBase,
    rank: skill.rank,
    locator: skill.locator,
    path: skill.path,
  }
}

function toDefinition(skill) {
  return {
    name: skill.name,
    description: skill.description,
    ...(skill.metadata === undefined ? {} : { metadata: skill.metadata }),
    invocation: skill.invocation,
    provider: skill.provider,
    source: skill.source,
    resourceBase: skill.resourceBase,
    path: skill.path,
    content: skill.content,
  }
}
