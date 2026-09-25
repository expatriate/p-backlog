# Changelog

## Unreleased

- Every statistics chart (debt, created, check precision, effect, usage) has its own "week / day" toggle: 12 weeks or
  30 days; the choice is remembered per chart. Cost history is now kept for 12 weeks, so weekly usage fills in as data
  accumulates (Claude Code deletes transcripts after 30 days by default).
- Codex and Cursor share one skill link in `~/.agents/skills` (Cursor reads it too); `setup` removes the older
  `~/.cursor/skills` / `~/.codex/skills` links it made, and `setup --remove-manual --agent cursor` keeps the shared
  link while Codex still uses it. Before, Cursor listed the skill up to three times.

## 0.5.0

Claude Code plugin and other agents:

- The repository is a Claude Code plugin marketplace: `/plugin marketplace add expatriate/p-backlog`, then
  `/plugin install p-backlog@p-backlog` (English skill) or `p-backlog-ru@p-backlog` (Russian). The plugin brings the
  skill and the Stop hook; the CLI still comes from npm, and the plugin needs p-backlog CLI 0.5.0 or newer (older CLIs
  reject `hook stop --agent`).
- `backlog setup` connects Codex CLI and Cursor too: it finds them by `$CODEX_HOME`/`~/.codex` and `~/.cursor`, links
  the skill and adds the Stop hook to their `hooks.json`; `--agent claude|codex|cursor` limits it to one agent. Codex
  runs the new hook only after you approve it once in `/hooks`; `setup` reminds you.
- `backlog hook stop --agent codex|cursor` reads their Stop events; Cursor gets the re-check request as a follow-up
  message.
- With the plugin enabled, `setup` leaves Claude Code alone; `backlog setup --remove-manual` removes the skill links
  and Stop hooks installed earlier; it cannot be combined with `--service`. Two Stop hooks in one turn (plugin and
  manual) answer once.
- `backlog config language` switches the skill for every agent where `setup` installed it and, with the plugin, tells
  which plugin to install.
- Cost statistics note that Codex and Cursor usage is not counted.

## 0.4.0

Bulk triage in the web UI:

- Select tasks with checkboxes (row checkboxes, "select all visible", Shift+click or Shift+Space for a range, Space on a
  row's link) and act on all of them at once: close as obsolete with a shared reason, change priority, or move to an epic /
  out of an epic. Alt+A (⌥A on macOS) jumps to the actions.
- After an action a notice shows the result ("Closed 11 of 12", skipped tasks as links with the reason) and an **Undo**
  button that restores status, priority and epic for tasks nobody changed since. An undone close does not count in the
  statistics.
- The server applies a batch task by task under the same file locks and version checks as single edits
  (`POST /api/tasks/batch`); a task locked by another process or changed on disk is skipped, the rest are applied.
  Selections over 500 tasks are sent in parts.

Other changes:

- An epic closed automatically because all its tasks were done reopens when one of its tasks is open again (edit, undo,
  a new task in it, `check`, cleanup). `check --json` reports it as the `epic-reopened` fix. A manually closed epic stays
  closed.
- An epic from another project is rejected on every write path (web, CLI, bulk action), with a hint to clear the epic.
- The web UI refetches the task list once after your own edit instead of twice; `/api/projects` now returns
  `{ projects, revision }` — reload browser tabs opened before the update.
- The web UI runs without `eval` (zod in jitless mode), so it has no Content Security Policy violations.

## 0.3.0

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

Fixes:

- Re-check: the symbol filter looks the task's symbol up at the task's current line, so a candidate is no longer
  dropped (and the anchor re-attached to a neighbouring function) when lines above the task moved.
- Re-check: edits that arrive with a merge commit are seen; the diff base follows the first parent; a user's external
  diff tool or `diff.suppressBlankEmpty` no longer breaks hunk parsing; `git log` is limited to the tasks' paths, and a
  git failure is reported instead of silently producing no candidates.
- Re-check: `verify` clears the anchor when the task's line is past the end of the file, and moves `source` to the
  task's current place when the lines shifted.
- Task numbers of deleted tasks are never reused, even when `backlog new` races with the cleanup.
- An unparseable `project.md` no longer makes `backlog new` create a second project with the same prefix.
- Git worktrees belong to the main repository's project; the hook and checks see commits made in the worktree.
- The Stop hook remembers what it already told each session separately, so parallel sessions don't repeat each other.
- Statistics: a task whose file can't be parsed keeps its last status instead of an invented "cancelled"; the open
  count, forecast and debt curve use one history; model prices are matched by exact id (`claude-opus-5-5` added);
  fixes are dated by when they landed on the main branch.
- Web UI: a focused field no longer overwrites an edit made by the agent meanwhile (a conflict is shown instead); a
  failed background refresh no longer wipes the page and the description draft; errors are shown in the interface
  language; all tabs share one live-update connection, so many open tabs no longer stall.

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
