# Contributing to p-backlog

Thanks for helping. Bug reports, ideas and pull requests are welcome — for anything bigger than a small fix, open an
issue first so we can agree on the approach before you spend time on it.

By participating you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md). Security problems go through the
[Security Policy](SECURITY.md), not public issues.

## Setup

You need Node.js 22.13 or newer and git.

```bash
git clone https://github.com/expatriate/p-backlog.git
cd p-backlog
npm install
npm run build
```

`npm run dev` starts the server and Vite with hot reload; see [Development](README.md#development) for linking the
CLI, the Playwright e2e tests and the package test.

## Before you open a pull request

```bash
npm run typecheck
npm run lint        # eslint, knip (unused code) and the Cyrillic gate
npm test            # node and web tests
```

CI runs the same on Linux, macOS and Windows (Node 22–26), plus Playwright and the installed-package test. Keep paths,
shells and line endings portable: the CLI and the hooks run on all three.

## How the code is written

- **Self-documenting code, no comments by default.** Names, types and structure carry the meaning. A comment is allowed
  only where the code can't say it: a tool directive (`eslint-disable`, `@ts-expect-error`), or a platform/library
  constraint invisible from the code.
- **Tests for behaviour that matters.** Add a test when it catches a real bug that would hurt users or data, and assert
  observable results (files on disk, command output, the API response, what the UI shows) — not mocks or internals.
  A new test should fail without your change.
- **Never touch real data in tests.** Use the temp-directory helpers in `src/core/store/testing/` and the CLI sandbox in
  `src/cli/testing/`; tests must not read or write `~/backlog`, `~/.claude`, `~/.codex`, `~/.cursor` or port 4317.
- **Two languages.** User-facing text lives in the `messages.ru.ts` / `messages.en.ts` catalogs (the Russian one defines
  the type); Cyrillic outside those catalogs, tests and `testing/` folders fails `npm run lint`. The skill has a Russian
  (`skill/backlog`) and an English (`skill/backlog-en`) variant that must stay in step — `tests/skill-parity.test.ts`
  checks it. After changing a skill or the version, run `npm run plugins` and commit the regenerated `plugins/`.
- **Caches must equal a recomputation.** Statistics caches (journal tails, report memos, the git code cache) may only
  change how much work is done, never the result.

## Commits and pull requests

- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/): `fix(cli): …`, `feat(web): …`,
  `test(core): …`, `docs: …`. The subject may be in English or Russian; say what changes for the user.
- Keep a pull request to one topic. Describe what changes and how you verified it (commands, screenshots for UI).
- Add a line to `CHANGELOG.md` under `## Unreleased` for anything a user would notice.
- Don't bump the version — releases are cut by the maintainer and published from a tag by GitHub Actions.
