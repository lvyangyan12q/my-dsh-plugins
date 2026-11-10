# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Layout: single-context

```
/
├── GLOSSARY.md          ← 工作台 / 应用 / 项目 / 考公 等术语的唯一权威
├── docs/adr/            ← 系统级决策
└── plugins/, workspaces/, docs/
```

No `GLOSSARY-MAP.md`: this is not a multi-context repo. Per-plugin docs (`plugins/*/AGENTS.md`) describe how to work in that plugin; they do not replace the root glossary.

## Before exploring, read these

- **`GLOSSARY.md`** at the repo root.
- **`docs/adr/`**: read ADRs that touch the area you're about to work in.

If either is missing for the area you need, **proceed silently**. Don't flag the absence and don't propose creating them upfront. The `/domain-modeling` skill creates them lazily when terms or decisions actually get resolved.

## Use the glossary's vocabulary

When output names a domain concept — an issue title, a refactor proposal, a hypothesis, a test name — use the term as defined in `GLOSSARY.md`. Don't drift to synonyms the glossary explicitly avoids.

The glossary is written in Chinese; keep using the Chinese terms in tickets and specs, even when the surrounding prose is English.

If the concept you need isn't in the glossary yet, treat it as a signal: either the language is invented (reconsider) or there is a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders), but worth reopening because…_
