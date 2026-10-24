# Security

## Scope

`dsh-eda-review` is a read-only DSH Skill bundle. It registers bundled
`SKILL.md` files on `ctx.skills` and performs no other work.

## Permission surface

| Capability | Status |
| :--- | :--- |
| Filesystem write | none |
| Network access | none |
| Child process / shell | none |
| Install-time scripts | none (`preinstall`, `install`, `postinstall`, `prepare` are absent) |
| Credentials / tokens / env vars | none |
| Reads | bundled `skills/**/SKILL.md` only |
| Frontmatter parse bound | 64 KiB |
| SKILL.md read bound | 1 MiB |

## Trust boundary

- The only data entering the parser is the text of `SKILL.md` files shipped
  inside this package. No user files, no workspace files, no remote content.
- `yaml` is used only as a text parser. If it is not resolvable (for example a
  link install that did not install dependencies), the built-in parser handles
  the DSH frontmatter subset and the plugin still loads.
- Frontmatter parsing is pure text processing: no `eval`, no `new Function`,
  no dynamic imports other than the optional `yaml` load.
- Malformed frontmatter fails loudly with a clear error and never executes
  parsed content.

## Reporting

Open an issue at <https://github.com/chaser-star/dsh-eda-review/issues>.
