// SPDX-License-Identifier: Apache-2.0
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
  const skills = ctx?.skills
  const registerProvider = skills?.registerProvider

  if (typeof registerProvider !== 'function') {
    // Older or differently-shaped hosts: stay inert instead of breaking boot.
    const message =
      'dsh-eda-review: ctx.skills.registerProvider() is unavailable in this DSH runtime; ' +
      'the eda-project-review skill will not load. A DSH release exposing the skills provider seam is required.'
    const logger = ctx?.logger
    if (logger !== undefined && logger !== null && typeof logger.warn === 'function') {
      logger.warn(message)
    }
    return
  }

  registerProvider.call(skills, () => ({
    name: PROVIDER_NAME,
    async list(options) {
      options?.signal?.throwIfAborted()
      const skillsList = await loadSkillsFrom(SKILLS_ROOT, options?.signal)
      options?.signal?.throwIfAborted()
      return skillsList.map(toCandidate)
    },
    async get(candidate, options) {
      options?.signal?.throwIfAborted()
      if (candidate === null || typeof candidate !== 'object' || typeof candidate.name !== 'string') {
        return undefined
      }
      const skillsList = await loadSkillsFrom(SKILLS_ROOT, options?.signal)
      const skill = skillsList.find((entry) => entry.name === candidate.name)
      return skill === undefined ? undefined : toDefinition(skill)
    },
  }))
}

/**
 * Load skill definitions from a directory root. Exported for tests.
 */
export async function loadSkillsFrom(root, signal) {
  const entries = await readdir(root, { withFileTypes: true })
  const skills = []

  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
    signal?.throwIfAborted()

    const directory = join(root, entry.name)
    const skillFile = join(directory, 'SKILL.md')

    let raw
    try {
      raw = await readFile(skillFile, 'utf8')
    } catch (error) {
      // A directory without SKILL.md is not a skill: skip it instead of
      // failing the whole provider listing.
      if (error !== null && typeof error === 'object' && error.code === 'ENOENT') continue
      throw error
    }

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
