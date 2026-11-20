# Agent instructions (Antigravity, Claude Code and other coding agents)

- Read `CONTRIBUTING.md` and the skills in `.agents/skills/` first.
- Never invent model IDs or parameter names: read the live docs as Markdown (`https://aistudio.google.com/docs/<page>.md`).
- The model never writes game state. Engine validates every proposal.
- Do not print, log or commit secrets. Do not run untrusted learner code on this server.
- Commits are authored by the human maintainer only. Do not add co-author or attribution trailers.
- Keep claims honest: a Google service is "live" only if it is on the request path (see `docs/BUILT_VS_PLANNED.md`).
