# Changelog

## Unreleased

- `backlog check` no longer asks to re-check a task without an anchor just because its own branch was merged by squash
  or rebase: the squash commit, or the rebased copies of the branch's commits, count as known when they bring only what
  the task's creation commit already had, as a merge commit of that branch already did. So does a merge commit that
  brings only such copies (the branch rebased before `merge --no-ff`, or squashed into another branch that is merged
  later). Edits the branch made after the task was created, and later edits of the file, still make the task a
  candidate, even when they repeat a branch edit that was undone before the task was created.
- A repository path in a `project.md` that exists but cannot be read (no permission, for example) is now named in a
  warning when the CLI or the Stop hook looks up the project of the current directory; before, it was silently treated
  as a missing path. The same goes for an installed service file that `backlog service status` or `backlog stats`
  cannot read: they warn and use `PORT`. An agent directory that `backlog setup` or `backlog config` cannot read (for
  example, `CODEX_HOME` without permission) is named in a warning and that agent is skipped, while the other agents are
  set up as usual; before, it was reported as "not found". The same goes for a Claude Code settings file that cannot be
  read: before, `backlog setup` stopped there without setting up Cursor or Codex, and `backlog config language` saved
  the language but did not relink any skill. Now Claude Code is named in a warning (`backlog setup` skips it and still
  exits with code 4), and the other agents are set up or relinked as usual. `backlog config language` still repoints
  an existing Claude Code skill link to the new language (it cannot tell whether a plugin provides the skill, so it
  never creates a link there); without such a link it says the link was left unchanged and asks to re-run the command
  once the file is readable. A skill link, or a legacy skill link of Cursor or Codex, that `backlog setup
  --remove-manual` cannot remove is named in a warning, the agent's hook is still removed, and the command exits with
  code 4.
- The statistics of a project whose directory is named `all` are no longer shown as the statistics of all projects (or
  the other way round) after switching between the two in the web UI.
- The card of a closed task whose file lacks the closing date or the reason (or has a blank one) now says "Closed,
  date not recorded" / "reason not recorded" instead of leaving a blank after "Closed" or a dangling dash.
- The chart scale (week / day) picked on the statistics page now applies to other open tabs at once. With browser
  storage blocked, "new" badges also work for tasks created while the tab is open.
- The confirm button of the delete-project and close-tasks dialogs stays reachable with Tab while it is not yet
  available, like the other unavailable buttons; it is still announced as unavailable.
- A tag with a comma inside, written by hand in a task file (`tags: ["ui, web"]`), is now read as separate tags (`ui`,
  `web`), the way `backlog new --tags` and the web form already split it, and the next save of the task writes them
  back to the file as separate tags. Before, such a tag showed up as one chip, and clicking it in the web list (or
  following it from the statistics) showed no tasks.
- On the statistics page of a project whose id has spaces or non-Latin letters, the tab being loaded is now highlighted
  and the page is marked busy, as for other projects.
- `backlog serve` (the background service included) is no longer recorded as a command run: stopping or restarting the
  service no longer adds a `serve` row with an uptime of hours to the Commands table on the cost tab, or counts it in
  "other commands". `serve` records already in `.runs.jsonl` are ignored by the report too.
- An invalid `PORT` (not a number from 1 to 65535) is no longer silently replaced with 4317 when no service is
  installed: `backlog stats` warns about it and prints the summary without the web link, and `backlog service status`
  rejects it with exit code 1, as `serve` and `service install` already did.
- `backlog check` no longer leaves a task created on a branch "awaiting merge" forever when that branch was merged by
  squash or rebase while the local branch still exists. The branch counts as merged once the current branch's history
  has, for every file the branch changed, either the branch's version of the file, or the branch's whole change to it
  in one commit (squash), or each of the branch's commits to it (rebase); changes are compared as `git patch-id` does,
  so edits elsewhere in the same file on the current branch do not matter, and later edits do not undo it. A change
  whose surrounding lines (3 on each side) were edited on the current branch in the meantime, or that was resolved by
  hand in a conflict, is not recognized, and its task keeps waiting as before. A task whose creation commit is gone
  from the repository is re-checked again too. A repository without commits yet is checked as
  having an empty history instead of reporting it unreadable, and a failure to run git is reported as unreadable
  history rather than "not a git repository".
- A command that waits 5 seconds for a busy `journal.jsonl` appends its events without the lock; when that happens
  while compaction is rewriting the journal, compaction now carries such lines over into the compacted file, including
  a line that was still being written when compaction read the file. If the journal was replaced by a different file
  in the meantime, compaction leaves it as is.
- A task source or project repository path that cannot be read (no permission, a name too long, a symlink loop) is
  reported and skipped instead of being treated as missing: `backlog check` and the Stop hook print a warning with the
  path and the error and leave the tasks with that source out of this run (no `source-missing` or `source-changed`
  for them, other tasks are checked as usual); `new --source` and `verify` warn and save the task without a new anchor;
  `close` warns and skips that repository. A source that is a directory, does not exist or runs through a file
  (`src/a.ts/b.ts`) is still treated as having no file to read.

## 0.9.0

- `backlog close <ID> --as fixed --reason "Fixed in <sha>: …"` on a task closed with `status <ID> done` now attaches the
  fix commit without reopening it (exit 0 instead of 3; status and closing date stay). Statistics then count that
  closing as fixed, so Effect sees the commit. `status <ID> done` suggests this command, and returning a fixed task to
  work prints its earlier commits so the next `--reason` starts with them (statistics count the first commit).
- The skill asks the agent to close a task only after tests, checks and review, right after committing, with the hash
  from `git commit`; `status done` is for changes that the user will commit later or that have no commit.
- Re-checks are quieter. "Code changed" for anchored tasks is raised only when the task's own lines (±2) changed
  after the state the task was last verified in; switching to a branch without that state no longer raises it.
  "File missing" is raised only when the file was deleted or renamed on the current branch, is deleted in the working
  tree, or is unknown to git — a file that lives on another branch no longer counts. A renamed file whose task lines
  are intact moves the task's `source` by itself (`source-moved`). Replayed on a real backlog, re-check candidates
  went from 112 to 76 (precision 17 % → 23 %) without losing any task that a re-check led to close.
- `backlog new` and `backlog check` treat two open tasks as a possible duplicate only when their `source` is in the
  same file and their titles share several words, or when the titles are nearly the same (version numbers and dates
  are compared whole). Shared words alone — review-nit groups, one area of the code — and the same line or function
  with unrelated titles no longer count. On a real backlog, check offered 6 pairs instead of 159 and `new` refused 5
  times instead of 73, still catching the known duplicates it caught before.
- The web list "Closed by the agent" and its chip count no longer include tasks a person closed in the web UI (the bulk
  "Close as obsolete" action and epics that closed after it); tasks closed through the CLI stay there. `GET /api/tasks`
  gains a `closedInWeb` field. An unreadable project journal no longer breaks the board — the server warns instead.
- `backlog new` keeps `manual` as the default for `--found`, and `--help` says so; the skill tells the agent to always
  pass `--found` (without it the task does not count in Effect). The skill's exit-code table for `take` explains that
  code 1 also means a write conflict or a validation error.
- `backlog prune --all-projects` considers only active projects, like `list` and `stats`.
- `backlog setup` recognizes the earlier PowerShell form of the Claude Stop hook and replaces it instead of adding a
  second hook; `setup --remove-manual` removes it too. Codex and Cursor Windows hooks are recognized whatever the CLI
  bundle file is named.
- CLI commands that reopen an epic that had closed by itself (including `backlog new --epic`) say so on stderr, and
  `new --json` shows the epic's current status.
- `backlog new` in a new repository no longer reuses a prefix declared in another project's `project.md` whose header is
  broken.
- Hotspots, churn × debt and debt density put tasks with a source like `./src/…` into `src` and files in the repository
  root into `.`; a source pointing at a folder with a trailing slash counts in that folder again.
- The Code tab counts files such as `X.test.tsx.snap` as tests, as its explanation says; the code cache version is
  bumped, so the git history is read once more after updating.
- Effect shows "≈" only for numbers that include an estimate of pending tasks — the same rule for tiles, the summary,
  the chart tooltip and the projects table. The accuracy chart shows a point at 0 %. Chart tooltips and the weekly
  trend group digits like the tables. English durations of 1000 days and more group digits too.
- "Created today / closed today" count from local midnight to now, like the daily rows.
- A duplicate candidate of a task from an unmerged branch is recorded in the journal exactly as it is shown, so check
  accuracy no longer loses it; the "unknown journal lines" warning also counts candidate events with renamed values.
- The language switch in the web UI unlocks as soon as the setting is saved instead of after every query refetches.
- A failed task or project write in the web UI resets the server caches, so the UI never shows a half-written state.
- `.hook-turns.json` and `.candidates-shown.json` store local times with an offset, like the other files.
- Releases are published from a tag only after CI is green for that commit and `test:package` passes, with a pinned npm
  version.

## 0.8.1

- Effect counts every task recorded as `incidental` again, including tasks recorded by earlier versions, where
  `incidental` was the default. Without such tasks the tab explains why there is nothing to measure, and the share of
  unrelated edits shows "—" instead of 0 %.

## 0.8.0

- The task list no longer says "No tasks yet" while the project list is loading or after it failed to load: it shows
  loading, or the error with Retry — in the list and in the sidebar.
- A task file locked by another process no longer aborts the whole closed-task sweep or `backlog check`: the task is
  skipped as busy and the rest continue. CLI commands that change a task report the lock and exit with code 4.
- A bulk action continues when one task fails to write: that task is reported as failed (new skip reason `failed` in
  `POST /api/tasks/batch`), the others are changed and can be undone.
- `backlog check` reports failed anchor updates as `fix-failed` problems (exit code 5) and warns when a project journal
  cannot be read instead of silently ignoring branch origins.
- `backlog take --next` exits with code 2 ("nothing to take") instead of 3 when the only tasks left are already in
  progress.
- Effect also counts fixes closed 12–13 weeks ago, as the 13-week retention window always intended; numbers may shift
  slightly.
- The service's report cache drops expired reports, so its memory no longer grows with every day of uptime; the code
  cache keeps a hash of what it wrote instead of a full copy.
- The code-graph state on the Quality tab refreshes as fast as in the project list; a failed task edit no longer drops
  cached statistics; an epic reopened by the service no longer triggers a second full reload in open tabs.
- Two agent hooks finishing at the same time no longer lose each other's "signal shown" marks.
- New task numbers ignore directories and files without `.md` named like a task ID.
- A repository in a directory whose name starts with `..` (for example `~/..cfg/repo`) is recognized as inside the home
  directory.
- An unreadable `project.md` is reported as an error instead of "project not found".
- `backlog stats` on Linux no longer runs `systemctl` just to print the web address.
- Tables on the Quality tab group digits like the rest of the statistics; the memory chart caption says "over 1 hour".
- The web build fails if a Node-only module ends up in the browser bundle.

## 0.7.0

- Project journals are compacted once a day, by the service and after CLI commands other than the agent hook. Removed:
  events of tasks whose file no longer exists and whose last event is older than 13 weeks; check events (`candidate`,
  `candidate-gone`, `candidate-filtered`, `verified`) older than 13 weeks; unreadable journal lines written before the
  first event of the last 13 weeks. Kept: the whole history of tasks whose file exists, the event that opened a
  still-open check episode and the earliest event. Statistics reports stay the same after compaction; only the
  journal's own line counters (task count, unreadable and unknown lines) change.
- Effect splits a commit shared by several fixes, and takes the samples for the pending estimate, only from fixes
  closed within the last 13 weeks, so compaction cannot change them. Numbers on the Effect tab may shift slightly after
  updating.
- The graph filter records a filtered candidate once per check episode instead of on every check. "Filtered out" in
  the Code graph panel of the Quality tab now counts episodes; repeats recorded before the update stay in the count until they age out of
  the 12-week window.
- The usage cache drops usage older than 13 weeks; "By model" now covers the last 30 days. The Cost tab says since
  which date usage data exists when it starts inside the 12-week window.
- The CLI run log is kept for 13 weeks (was 12), and the agent hook trims it too, so without the service it no longer
  grows with every agent turn.
- On macOS the service log is trimmed to its last 256 KB once it exceeds 1 MB. On Windows a log over 1 MB is moved to
  `p-backlog.log.old` when the service starts (at sign-in or `backlog service install`).
- Without the service, closed tasks older than 7 days are deleted after a CLI command other than the agent hook, at
  most once a day, and the command warns about tasks it could not update and files that keep epics open. The service
  marks its own hourly sweep, so while it runs the CLI does not repeat the sweep. The service's cleanup steps (closed
  tasks, journal compaction, run log, service log) no longer stop each other when one fails.
- Every statistics panel shows its period with dates; the Effect tab says "over 12 weeks (since adoption, if later)".
  The "90 days" code churn caption spans exactly 90 calendar days. The Effect chart's bars are labelled "on topic in
  pull requests": pull request lines without the fixes of backlog tasks; "in pull requests" everywhere else means all
  lines of the commits.
- Effect counts only tasks the agent explicitly recorded with `--found incidental`. Review and audit findings, tasks
  recorded at the user's request and every task recorded before this version (earlier versions wrote `incidental` by
  default, so those cannot be told apart) are no longer counted as a gain; they stay on the Quality tab under Origin.
  `backlog new` now defaults to `--found manual`, and the skill tells the agent to pass `--found incidental` for
  problems it noticed itself. Effect numbers drop after updating until new tasks are recorded this way.
- After updating, reinstall the service (`backlog service install`) so the running server serves the new API.

## 0.6.0

- Statistics on the server read only what was appended to project journals and the CLI run log, keep parsed task
  histories between requests, and rescan git only for new commits (a new day no longer rescans the 90-day window, and
  if reading the main branch's log fails, the repository is shown as unavailable for that refresh instead of silently
  showing no changes); a change in one project no longer drops the cached reports of the others.
- The Code tab's commit counts now also include commits of merged branches that git history simplification used to
  skip (a merge tree-same with a parent: a change and its revert, `merge -s ours`, a change already cherry-picked) —
  on ordinary histories nothing changes.
- The code cache file format changed, so the first run after this update rescans git once.
- An event appended to a project journal or the CLI run log no longer merges with the last line when that line lacks
  a trailing newline (a hand edit, an interrupted write): both events stay readable.

## 0.5.1

- Every statistics chart (debt, created, check precision, effect, usage) has its own "week / day" toggle: 12 weeks or
  30 days; the choice is remembered per chart. Cost history is now kept for 12 weeks, so weekly usage fills in as data
  accumulates (Claude Code deletes transcripts after 30 days by default).
- Codex and Cursor share one skill link in `~/.agents/skills` (Cursor reads it too); `setup` removes the older
  `~/.cursor/skills` / `~/.codex/skills` links it made, and `setup --remove-manual --agent cursor` keeps the shared
  link while Codex still uses it. Before, Cursor listed the skill up to three times.
- On Windows, writing a task file waits up to about 5 seconds (was about 1.3) for another process such as an
  antivirus or indexer to release it.

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
