# p-backlog

[![npm](https://img.shields.io/npm/v/p-backlog)](https://www.npmjs.com/package/p-backlog) [![downloads](https://img.shields.io/npm/dm/p-backlog)](https://www.npmjs.com/package/p-backlog) [![CI](https://github.com/expatriate/p-backlog/actions/workflows/ci.yml/badge.svg)](https://github.com/expatriate/p-backlog/actions/workflows/ci.yml) [![node](https://img.shields.io/node/v/p-backlog)](https://nodejs.org) [![license](https://img.shields.io/npm/l/p-backlog)](LICENSE)

**[Русская версия](README.ru.md)**

**Keep pull requests clean. Never lose an audit finding.**

A personal backlog for Claude Code that lives next to your code as Markdown files. When the agent notices a problem
outside the task at hand, it doesn't slip a fix into your pull request — it files a task with the file, the line and
what will break. Findings from audits and code reviews become tasks too, instead of getting lost in chat history.

- **Clean pull requests.** Out-of-scope fixes go to the backlog, not into the diff you review. The Effect tab in
  statistics shows how many lines stayed out of your pull requests.
- **Nothing gets lost.** Every finding from an audit or a review is a task with its source (`file:line`), what it
  risks and a checklist.
- **Context kept, tokens saved.** A task stores the context the agent needs to pick it up later. On a re-check the
  agent gets the task's summary, the current code around its line and the diff since the last check — usually
  enough to decide without re-reading the codebase.
- **Stays current by itself.** A Stop hook asks the agent to re-check tasks whose code changed. The agent closes
  fixed ones with the commit as evidence; line numbers follow the code as it moves. Closed tasks are cleaned up
  after 7 days.
- **Local and autonomous.** Plain files in `~/backlog`, no account, no cloud. The agent drives it through the skill,
  so you don't have to touch the CLI — though you can.
- **Charts when you want them.** Start the local web app to browse and triage tasks and follow the metrics: debt by
  week, where it hurts in the code, how accurate the checks are, what the hook costs in tokens.

It consists of the `backlog` CLI, the `backlog` skill and a Stop hook for Claude Code, and an optional web app.

## Screenshots

![Task list across three projects: the sidebar with project checkboxes and task counts, status, priority and type filters, and open tasks with tags, status, priority and creation date](https://raw.githubusercontent.com/expatriate/p-backlog/main/docs/screenshots/en/tasks.png)

![Task card of a bug in progress: status, priority, category and epic fields, the source file:line, a description with a half-done checklist, the task that blocked it and a related task](https://raw.githubusercontent.com/expatriate/p-backlog/main/docs/screenshots/en/task.png)

<details>
<summary>Statistics: overview, effect, code</summary>

![Statistics overview: alerts about stale urgent and low-priority tasks, tasks created and closed today and this week, debt by week and tasks created by day](https://raw.githubusercontent.com/expatriate/p-backlog/main/docs/screenshots/en/stats.png)

![Effect tab: lines deferred to the backlog next to lines in pull requests, week by week, with the share of unrelated edits kept out of pull requests](https://raw.githubusercontent.com/expatriate/p-backlog/main/docs/screenshots/en/effect.png)

![Code tab of one project: open debt in frequently changed folders ranked by commits times task weight, and debt density per 1000 lines](https://raw.githubusercontent.com/expatriate/p-backlog/main/docs/screenshots/en/code.png)

</details>

## Getting started

1. **Install the CLI** (needs Node.js 22.13 or newer):

   ```bash
   npm i -g p-backlog
   ```

2. **Connect your agent.**

   - **Claude Code — the plugin (recommended).** In Claude Code run:

     ```
     /plugin marketplace add expatriate/p-backlog
     /plugin install p-backlog@p-backlog
     ```

     `p-backlog-ru@p-backlog` installs the Russian skill instead. The plugin brings the skill and the Stop hook
     and updates with `/plugin marketplace update p-backlog`; the CLI itself still comes from npm.
   - **Without the plugin, and for Codex and Cursor:** `backlog setup` links the skill and adds the Stop hook
     for every agent it finds — see [Other agents](#other-agents).

3. **Language** — defaults to Russian if a backlog already exists, otherwise to the system locale.
   Change it any time:

   ```bash
   backlog config language en   # or ru
   ```

4. **First project and task** — open Claude Code in your repository and ask it to log something to the
   backlog, or create a task yourself:

   ```bash
   backlog new --title "Upload timeout ignores file size" --category bug <<<'Problem description'
   ```

   `backlog new` creates the project for the current repository itself if it doesn't exist yet.

5. **Web app** — `backlog service install` runs it at `http://localhost:4317` and starts it on login; check with:

   ```bash
   backlog service status
   ```

6. **The Stop hook and alerts** — after each of the agent's turns in a repository, the Stop hook checks
   whether the code behind that project's open tasks changed, and if so asks the agent to re-check them.
   It also surfaces alerts — signals about the backlog's health (growing debt, stuck tasks, stale
   low-priority tasks, and so on); `backlog stats` shows the same summary.

## Other agents

`backlog setup` finds the agents installed on this machine and connects each of them; `--agent claude|codex|cursor`
limits it to one:

| Agent | Found by | Skill | Stop hook |
|---|---|---|---|
| Claude Code | always | `~/.claude/skills/backlog` | `~/.claude/settings.json` |
| Codex CLI | `$CODEX_HOME` or `~/.codex` | `<codex home>/skills/backlog` | `<codex home>/hooks.json` |
| Cursor | `~/.cursor` | `~/.cursor/skills/backlog` | `~/.cursor/hooks.json` |

The skill is a link to the package's skill in the configured language; `backlog config language` switches it for
every agent. Other hooks in those files stay as they are, and running `setup` again adds nothing twice. In Cursor the
re-check request arrives as a follow-up message. Token and cost statistics cover Claude Code only.

If the Claude Code plugin is enabled, `setup` leaves Claude Code alone; `backlog setup --remove-manual` removes the
skill links and Stop hooks that `setup` installed earlier (for all agents, or for `--agent`).

## Where tasks live

The backlog directory is `~/backlog`, or the path from the `BACKLOG_DIR` variable. Inside it, one
directory per project:

```
~/backlog/spa/project.md   # name, prefix, repos
~/backlog/spa/SPA-12.md    # task: frontmatter + markdown
```

The project for the current directory is resolved by the git root and the `repos` field in `project.md`.
If there's no project yet, `backlog new` creates it.

## CLI commands

| Command | What it does |
|---|---|
| `backlog new --title <t> --category <category> [--type task\|epic] [--priority low\|medium\|high\|critical] [--tags a,b] [--found review\|incidental] [--source file:line] [--epic ID] [--blocked-by ID,…] [--related ID,…] [--project id] [--force] [--json]` | Creates a task, the description is read from stdin; a similar open task refuses the command (code 3), `--force` creates it anyway; `--found review` marks a review finding, the default is `incidental` (noticed in passing) |
| `backlog list [--query q] [--status s,…] [--tag t,…] [--project id \| --all-projects] [--json]` | Lists tasks, by default the open tasks of the current project |
| `backlog show <ID> [--json]` | The full task: links, blockers, warnings |
| `backlog take <ID> [--force] [--json]` \| `--next [--project id] [--json]` | Takes a task into progress, checking blockers |
| `backlog take --path <file\|directory> [--project id] [--json]` | Takes into progress every open task inside the path |
| `backlog status <ID> <backlog\|in-progress\|blocked\|done\|cancelled>` | Changes the status |
| `backlog priority <ID> <low\|medium\|high\|critical>` | Changes the priority |
| `backlog category <ID> <category\|none>` | Changes the category or clears it |
| `backlog epic <ID> [<ID> …] --to <epic ID\|none>` | Moves tasks into an epic or takes them out of it |
| `backlog check [--changed] [--project id \| --all-projects] [--json]` | Fixes dangling links and completed epics, finds tasks that are due for a re-check |
| `backlog close <ID> --as fixed\|obsolete\|duplicate --reason <evidence> [--duplicate-of ID]` | Closes a task with a reason; `fixed` only with a commit hash from the project's repository |
| `backlog verify <ID> [<ID> …] [--source file:line]` | Marks tasks as still relevant and remembers the code snippet |
| `backlog prune [--project id \| --all-projects] [--apply]` | Low-priority tasks older than 30 days; `--apply` cancels them |
| `backlog stats [--project id \| --all-projects] [--json]` | Statistics summary and alerts |
| `backlog project list \| status <id> active\|inactive \| delete <id> --confirm <id>` | Project activity and deleting a project with its tasks |
| `backlog hook stop [--agent claude\|codex\|cursor]` | The Stop hook of Claude Code, Codex, or Cursor: asks the agent to re-check tasks whose code changed |
| `backlog config language [ru\|en]` | With no value, prints the current backlog language; with a value, changes it |
| `backlog setup [--agent claude\|codex\|cursor] [--service]` | Skill and Stop hook for the agents found — Claude Code, Codex, Cursor (see [Other agents](#other-agents)); `--service` also the autostart service |
| `backlog setup --remove-manual [--agent claude\|codex\|cursor]` | Removes the skill links and Stop hooks that `setup` installed |
| `backlog serve [--port N]` | Runs the web server in the current process, on `PORT` or 4317 by default |
| `backlog service install \| uninstall \| status` | Autostarts the web server at login: launchd on macOS, systemd --user on Linux, a Startup-folder script on Windows; `status` shows whether it is installed and responding |

Exit codes: `0` success, `1` argument or rule error, `2` not found, `3` refused (the task is closed,
blocked, or every matching task is blocked), `4` the command failed, `5` `check` found candidates or task problems to
work through.

With `--json`, `new`, `show`, and `take` print the same task object (with progress, blockers, and links),
while `list` and `take --path` print an array of such objects.

A project that's no longer maintained is marked inactive: its tasks drop out of the combined "Projects"
scope's list and statistics, but the project's own page works as usual. Checks (`backlog check`), the Stop
hook, and deleting old closed tasks run across all projects, including inactive ones. Deleting a project
removes the `~/backlog/<id>` directory with all its tasks and journal — both in the UI and the CLI it
requires typing the project id to confirm.

## Backlog hygiene

- When the agent finishes a turn in a repository where open tasks reference code that changed, the Stop
  hook asks it to re-check those tasks. On request ("check the backlog"), it goes through the whole
  project.
- The agent closes a task that's no longer needed with `backlog close` and evidence; in the UI such tasks
  are visible under the "Closed by agent" link, and can be reopened.
- An epic whose tasks are all closed is closed by the server on its own, at startup and once an hour; such
  epics are also visible under "Closed by agent".
- Any closed task is deleted after 7 days along with its file — the server does this at startup and once
  an hour. The server keeps a completed epic's task around until the epic itself closes (for example, while
  the backlog still has unprocessed files) — the countdown then shows "deletion delayed" instead.
  Deleted task numbers are never reused.

## Works well with code-review-graph

[code-review-graph](https://github.com/tirth8205/code-review-graph) builds a local graph of your code (functions,
classes, their lines) in `.code-review-graph/graph.db` at the repository root. p-backlog doesn't need it, but uses
it when it's there — read-only:

- **Re-check by symbol.** A task's `source` (`file:line`) is matched to the function or class that contains it. The
  Stop hook and `backlog check` then flag the task only when that symbol changed, not when any line of the file
  moved — fewer needless re-checks. Without the graph the check falls back to the task's source lines, then to the
  whole file.
- **Duplicates by symbol.** Two tasks pointing into the same function are offered as possible duplicates.
- **Graph state in the web UI.** The sidebar warns when a project has no graph, when it's stale, or when it can't be
  read (built by a different version or for a different path), with the command that fixes it.
- **Check precision.** The Quality tab in statistics shows how often each check method (by symbol, by source lines,
  by file) was right.

Setup, once per repository (Python tool; `pipx install code-review-graph` works too):

```bash
uv tool install code-review-graph
code-review-graph build                       # in the repository root
code-review-graph install --platform claude-code  # optional: its MCP server and instructions for Claude Code
```

Keep the graph fresh with `code-review-graph watch`, or run `code-review-graph update` after changes. Tested with
code-review-graph 2.3.

## Web app

```bash
backlog serve             # runs the web server in the current process, on PORT or 4317 by default
backlog serve --port 5000
```

The server listens on `127.0.0.1` only and reflects directory changes immediately: a task created by the
agent shows up in an open tab without a reload.

To have it start automatically on login instead, install it as a service (macOS, Linux, and Windows are
supported):

```bash
backlog service install     # macOS: launchd, Linux: systemd --user, Windows: script in the Startup folder
backlog service status      # is it installed, is the server responding
backlog service uninstall
```

Logs:

- macOS — `~/Library/Logs/p-backlog.log`
- Linux — `journalctl --user -u p-backlog`
- Windows — `%LOCALAPPDATA%\p-backlog\p-backlog.log`

## Migrating from a clone

If you installed p-backlog by cloning the repository, switch to the package:

```bash
npm i -g p-backlog       # or, from the clone: npm link
backlog setup --service
```

`setup` relinks the skill from the clone to the installed package and doesn't add a second copy of the
Stop hook; with `--service`, `install` overwrites the autostart service in place, so it also replaces a
`local.p-backlog` LaunchAgent set up by hand from the old plist template.

## Updating

```bash
npm update -g p-backlog
backlog service install
```

The running service keeps executing the old `cli.js` until reinstalled — the web assets on disk are
already new, but `backlog service install` is what points the service at the new code.

After upgrading Node itself (for example via Homebrew), run `backlog service install` again too: the
service stores the path to the Node binary it was installed with.

## Uninstalling

```bash
backlog setup --remove-manual
backlog service uninstall
npm uninstall -g p-backlog
```

Run `backlog service uninstall` before removing the package — otherwise launchd's `KeepAlive` (or systemd's
`Restart=on-failure`) keeps relaunching a `cli.js` that no longer exists. Before that, remove the skill links
and Stop hooks from every agent (a plugin is removed with `/plugin uninstall`):

```bash
backlog setup --remove-manual
```

On Windows, the Startup-folder script does not restart a crashed server the way launchd `KeepAlive` or
systemd `Restart=on-failure` do — after a crash, run `backlog service install` again or start it with
`backlog serve`.

## Development

```bash
npm install
npm run build
npm link                # global backlog command
npm run install-skill   # ~/.claude/skills/backlog → skill/backlog and the Stop hook in ~/.claude/settings.json
npm run plugins         # after changing the skill or the version: regenerate plugins/
```

```bash
npm start           # builds and serves on http://localhost:4317
npm run dev         # server and Vite with hot reload
```

```bash
npm test            # unit, server, and UI tests
npm run typecheck
npm run lint

npx playwright install chromium   # once, before the first e2e run
npm run test:e2e                  # Playwright: live list update

npm run test:package              # the tarball install path end to end on this OS (slow)
npm run screenshots               # README screenshots on demo data, into docs/screenshots
```

To try a build the way a published package would install, without publishing it:

```bash
npm pack && npm i -g ./p-backlog-0.2.0.tgz
```
