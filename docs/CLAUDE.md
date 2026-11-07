# docs/

Docs exist to spend a reader's context window well. A page earns its length by what it saves an
agent from re-deriving, never by how completely it accounts for the repo.

- One page answers one question from one screen. If the agent still has to open the files, the
  page failed; if the page restates what one file says, it was not needed.
- Describe the mechanism and the invariant, not the file list. A table of files is a directory
  listing; a sentence on who owns a decision is knowledge.
- State only what was verified in the files named in `source`. A confidently wrong page costs
  more than no page. Say "not verified" rather than guess.
- Link, do not repeat: README, CONTRIBUTING, CLAUDE.md, the project skill and other wiki pages.
- `index.md` is a router, each link with the one question it answers. `values.md` is hand-written
  and never regenerated. Everything else carries `source` and `source_commit` and is rewritten by
  the `codebase-wiki` skill's refresh when its sources change.
