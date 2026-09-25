# Changelog

## Unreleased

CLI contract changes (scripts that parse output or exit codes may need updating):

- `take --path --json` prints a single JSON array instead of several JSON objects separated by `---`.
- `new --json` prints the same task object as `show --json` and `take --json` (with progress, blockers and links) instead of the raw stored task.
- `deletesAt` in `--json` output is a local ISO time with offset, like `created` and `closed`, instead of UTC.
- `check` exits with `5` only when there are candidates or task problems; project setup problems (no repos, missing repo, shared prefix) are reported with exit code `0`.
- `service` on a system without autostart support exits with `4` (the command failed) instead of `3` (refused).
- `backlog`, `backlog --help` and `backlog <command> --help` print help to stdout with exit code `0`.
- Argument errors are shown in the interface language and followed by the command's usage. Arguments that used to be ignored are now rejected with exit code `1`: extra words after `project list`, `--confirm` outside `project delete`, an empty `list --status`, `take <ID> --project`, `take --next|--path --force`, a `serve --port` that is not a decimal number from 1 to 65535.
- `serve` and `service install` reject a `PORT` environment variable that is not a decimal number from 1 to 65535 with exit code `1` instead of silently using 4317. `serve` exits with `0` after a clean stop on SIGTERM, SIGINT or SIGHUP.
- `stats` prints warnings about unparsed task files and journal lines before the "Open" line; `stats --json` has `unparsedTasks` and `invalidJournalLines`. `totals.open`, the age median and the open weight now count tasks by their history, so an open task whose file cannot be parsed is still counted. `forecast.windowWeeks` is replaced by `forecast.windowDays` — the span the weekly rate is computed over.
- `stats --json` also has `unknownJournalLines`, and `stats` prints a matching warning. A journal line with a renamed or otherwise unrecognized category, "how found" or resolution value is now read as `unknown` and kept in the quality breakdowns (its own row or `byReason.unknown`) instead of silently dropping out.
- `hook stop` exits with `0` on internal failures (for example, an unreadable backlog directory) and only prints a warning to stderr, so Claude Code on Windows no longer reports a hook error on every turn.

Other changes:

- `setup` writes `~/.claude/settings.json` atomically, keeps its key order and file mode, and writes through a symlink (including a dangling one) instead of replacing it.
- Windows service: `service install|uninstall` stops the process from `server.pid` only after checking that it is this p-backlog server; if the check is impossible, the PID file is kept and a warning is printed.
- The CLI trims `.runs.jsonl` by itself, so the run log no longer grows without the web server.
- `dist/server.js` is no longer shipped in the npm package.
- The server stops cleanly on SIGTERM, SIGINT and SIGHUP: it finishes edits already in progress, closes open browser tabs' event streams and removes its PID file, instead of being killed mid-write.
- The web UI cannot be embedded in another site's frame (`X-Frame-Options: DENY`, CSP `frame-ancestors 'none'`). The CSP loads scripts, styles and images only from the server itself (images also from `data:`), so an external image in a task description is not shown: text written by an agent cannot make the browser contact a third-party host.
- A file locked by another process for more than 5 seconds is reported by the API as `503` with an explanation instead of `500`.

## 0.2.4

- A clearer description on npm and GitHub, and a rewritten README introduction: out-of-scope fixes stay out of pull requests, audit findings don't get lost, tasks keep the context the agent needs. No code changes.

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
