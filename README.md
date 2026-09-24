# p-backlog

**[Русская версия](README.ru.md)**

A task backlog that lives as markdown files: an AI agent creates them while working on code, and a human
triages them in a local web app.

- **`backlog` CLI** — creates tasks, takes them into progress, changes their status.
- **`backlog` skill** for Claude Code — tells the agent when and how to call the CLI.
- **Web app** — project list, search, filters, epics, links, progress; doesn't create tasks.
- **Backlog hygiene** — the agent re-checks tasks whose code changed and closes the ones no longer needed;
  closed tasks are deleted after 7 days.

## Getting started

1. **Install** (needs Node.js 22.13 or newer):

   ```bash
   npm i -g p-backlog
   backlog setup --service
   ```

   `npm i -g p-backlog` installs the CLI globally; `backlog setup --service` installs the skill and the
   Stop hook for Claude Code and starts the web app as an autostart service.

2. **Language** — defaults to Russian if a backlog already exists, otherwise to the system locale.
   Change it any time:

   ```bash
   backlog config language en   # or ru
   ```

3. **First project and task** — open Claude Code in your repository and ask it to log something to the
   backlog, or create a task yourself:

   ```bash
   backlog new --title "Upload timeout ignores file size" --category bug <<<'Problem description'
   ```

   `backlog new` creates the project for the current repository itself if it doesn't exist yet.

4. **Web app** — already running at `http://localhost:4317`; check with:

   ```bash
   backlog service status
   ```

5. **The Stop hook and alerts** — after each of the agent's turns in a repository, the Stop hook checks
   whether the code behind that project's open tasks changed, and if so asks the agent to re-check them.
   It also surfaces alerts — signals about the backlog's health (growing debt, stuck tasks, stale
   low-priority tasks, and so on); `backlog stats` shows the same summary.

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
| `backlog take <ID> \| --next [--project id] [--force] [--json]` | Takes a task into progress, checking blockers |
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
| `backlog hook stop` | The Stop hook for Claude Code: asks the agent to re-check tasks whose code changed |
| `backlog config language [ru\|en]` | With no value, prints the current backlog language; with a value, changes it |
| `backlog setup [--service]` | Install the skill and the Stop hook; with `--service`, also the autostart service |
| `backlog serve [--port N]` | Runs the web server in the current process, on `PORT` or 4317 by default |
| `backlog service install \| uninstall \| status` | Autostarts the web server at login: launchd on macOS, systemd --user on Linux, a Startup-folder script on Windows; `status` shows whether it is installed and responding |

Exit codes: `0` success, `1` argument or rule error, `2` not found, `3` refused (the task is closed,
blocked, or every matching task is blocked), `4` the command failed, `5` `check` found something to
re-check.

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

## Development

```bash
npm install
npm run build
npm link                # global backlog command
npm run install-skill   # ~/.claude/skills/backlog → skill/backlog and the Stop hook in ~/.claude/settings.json
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
```

To try a build the way a published package would install, without publishing it:

```bash
npm pack && npm i -g ./p-backlog-0.2.0.tgz
```
