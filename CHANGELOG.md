# Changelog

## 0.2.3

- README: screenshots of the task list, a task card and statistics (English UI in README.md, Russian UI in README.ru.md), generated from fictional demo data with `npm run screenshots`. No code changes.

## 0.2.2

- README: npm, CI, Node and license badges; a section on using p-backlog together with code-review-graph (re-check by symbol). No code changes.

## 0.2.1

- npm keywords match the GitHub topics, so the package is easier to find in npm search. No code changes.

## 0.2.0

- Two interface languages: Russian and English (`backlog config language`, RU/EN switch in the web UI).
- Installable as an npm package: `npm i -g p-backlog`.
- `backlog setup` installs the agent skill and the Stop hook (replaces `npm run install-skill` from a clone).
- `backlog serve` runs the web UI; `backlog service install|uninstall|status` starts it at login on macOS (launchd), Linux (systemd --user) and Windows (Startup folder).
- Claude Code directory respects `CLAUDE_CONFIG_DIR`.
