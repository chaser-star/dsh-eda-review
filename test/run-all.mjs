// Single-process test entry: runs every suite without spawning child
// processes, so the same command works in constrained sandboxes and CI.
import './frontmatter.test.mjs'
import './safety.test.mjs'
import './golden.test.mjs'
import './differential.test.mjs'
import './robustness.test.mjs'
