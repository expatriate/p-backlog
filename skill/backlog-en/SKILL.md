---
name: backlog
description: Use when, while working on code, you notice a problem outside the current task that deserves its own follow-up (bug, tech debt, missing test, risky TODO); when the user says "log this to the backlog", "add a task", "what's in the backlog"; when asked to take a backlog task — "take SPA-12", "take the next task", "pick up the next task"; when asked to check or clean up the backlog — "check the backlog", "clean up the backlog"; or when a Stop hook message says the code of backlog tasks changed since their last check.
---

# Task Backlog

Tasks are markdown files at `~/backlog/<project>/<ID>.md` (the directory can be overridden with
`BACKLOG_DIR`). Creating tasks, taking them into progress, and changing their status all go through the
`backlog` CLI only: it hands out collision-free IDs, checks links, and finds the project from the current
repository. Never create or rename task files by hand.

If `backlog` is not found (`command not found`) — do not write task files yourself. Tell the user: "The
`backlog` CLI is not installed: run `npm i -g p-backlog`."

## Log a task

Log it yourself, without asking the user, when a finding is all of the following at once:

- **out of scope** for the current work — fixing it isn't part of what was asked;
- **specific** — there's a `file:line` and it's clear what will break or what it risks;
- **not fixed in passing**:
  - something that doesn't change behavior and sits in code you're already touching (a typo, an unused
    import, an imprecise name) — just fix it;
  - a bug that makes the code behave incorrectly — its own task, even if the fix is a one-line change in
    the same file: changing that behavior isn't what was asked;
  - if the current task can't be finished without fixing the bug — fix it as part of the task and say
    plainly in your answer what behavior you changed and where (`file:line`).

Don't log: taste-only remarks with no consequences, unverified guesses, or anything you're fixing within
this same task.

1. Check for duplicates by 2–3 keywords of the problem's essence:
   ```bash
   backlog list --query "upload timeout"
   ```
   If an open task about the same thing already exists, don't create a new one — mention the existing ID
   in your final answer.

2. Create the task. Always pass the description through a heredoc — without it the command waits on
   stdin:
   ```bash
   backlog new --title "Upload timeout ignores file size" \
     --priority high --tags upload,network --source src/upload/client.ts:88 --category bug <<'EOF'
   The timeout is fixed at 30 s; files over ~500 MB drop on a slow connection.

   **Impact:** large files fail to upload, and the retry fails too.

   **How to check:** upload a 2 GB file with network throttling set to "Slow 3G" in DevTools.

   ## Checklist
   - [ ] Compute the timeout from file size
   - [ ] Test for the timeout computation
   EOF
   ```
   - `--title` — the essence of the problem, not an action: "Upload timeout ignores file size", not "Fix
     the timeout".
   - `--priority`: `critical` — breaks production or data; `high` — a bug the user will notice; `medium` —
     debt that gets in the way of work; `low` — an improvement.
   - `--tags` — the area of code and kind of work: `upload`, `auth`, `tech-debt`, `tests`.
   - `--source` — where you noticed it, `file:line`.
   - `--category` — required. For a code smell, use its category from the code-smells catalog: `bloaters`,
     `change-preventers`, `couplers`, `data-dealers`, `dispensables`, `functional-abusers`,
     `lexical-abusers`, `oo-abusers`, `obfuscators`. For incorrect behavior, use `bug`.
   - `--found review` — a finding from an audit or review the user asked for; something noticed in passing
     needs no flag.
   - If you're working on a task from the backlog — add `--related <its ID>`.
   - The checklist holds verifiable steps: progress is counted from it.
   - Exit code 3 and "Looks like SPA-12 — …" mean such a task is already open: don't create a new one,
     mention the existing ID in your answer. `--force` — only if it's definitely a different problem.
   - Several small findings from one review (Minor level: smells, small inaccuracies) go into **one** task
     rather than one each: title "Review nits: <what was reviewed>", one checklist item per finding
     (`- [ ] Magic Number — src/a.ts:42: what's wrong`), `--category` — the most frequent category among
     the findings, `--source` — the location of the first one. Separate tasks are only for important
     findings and bugs.

3. End your answer with a separate block that starts with the line "Added to backlog:" — that's how the
   user finds new tasks in a long answer:
   ```
   Added to backlog:
   - SPA-14 — Upload timeout ignores file size
   ```
   If the CLI printed "Created project …" — add that as one more line.

Several tasks about the same thing — gather them into an epic: create the epic (`backlog new --type epic
--title …`) and move the tasks with `backlog epic <ID> [<ID> …] --to <epic ID>`; `--to none` takes a task
out of its epic. An epic closes on its own once all its tasks are closed.

## Take a task

"Take SPA-12" → `backlog take SPA-12`. "Take the next one" → `backlog take --next` (the project is picked
from the current repository; from another directory add `--project <id>`). "Take all tasks for
src/web/stats" → `backlog take --path src/web/stats`: takes every open task whose `source` is inside that
path (skipping blocked ones), and prints them one after another separated by `---` — fix them together,
closing each one.

| Code | What happened | What to do |
|---|---|---|
| 0 | Status became `in-progress`, the path, links, and task text were printed | Work on it |
| 1 | It's an epic | Show the user the epic's tasks from the output and ask which one to take |
| 2 | Task or project not found, no open tasks | Tell the user |
| 3 | Open blockers, or the task is already closed; with `--next` and `--path` — every matching task is blocked | List the blockers and stop. `--force` — only on the user's direct request |

1. Read the description and `source`; for related tasks you need, use `backlog show <ID>`.
2. Do the work. Finished a checklist item — mark it in the task file right away (`- [ ]` → `- [x]`, the
   path is in the `take` output). New steps came up — add them to the checklist. Don't edit the
   frontmatter by hand.
3. Unrelated problems found along the way — through "Log a task" with `--related <ID>`.
4. Before closing, verify the result with the project's own commands: tests, lint, types.
5. Everything is done, verified, and committed → `backlog close <ID> --as fixed --reason "Fixed in <sha>:
   <what exactly>"` — the hash lets stats know who fixed it and with what. No commit yet (changes aren't
   committed) → `backlog status <ID> done`. If the CLI warned about unchecked items — check off the ones
   that are done; if something isn't done, the task isn't finished.
6. Not everything is done → leave the status `in-progress`, append a section to the end of the task file
   and tell the user what's left:
   ```markdown
   ## Notes
   - <today's date>: done …; left …, because …
   ```

## Re-check tasks

When: the hook message "code changed for tasks since the last check", a request to "check the backlog", or
"clean up the backlog".

1. `backlog check --json` from the project's repository (from another directory — `--project <id>`).
   Dangling references, completed epics, and shifted `source` — it already fixed those itself; that's the
   `fixed` field, a list of `{ kind, taskId, … }`: `references-removed` — references to missing tasks `ids`
   removed; `epic-closed` — the epic closed, all its tasks `childIds` are closed; `source-moved` — `source`
   moved `from` → `to`. Relay it to the user in one line. Exit code 5 is not a failure: there are candidates or
   task problems to work through; 0 means there is nothing to work through.
2. A `source-changed` candidate already has `problem` in the JSON — the task description's first
   paragraph — `snippet` — the current code around `source` with line numbers — and `diff` — the file's
   changes since the last check (when cut short, `diffOmittedLines` says how many lines are not shown).
   That's usually enough: decide from them without calling `show`, `grep`, or `git show`. Read the task (`backlog show <ID>`) and the whole file only when `snippet` and `diff`
   aren't enough to tell; for `duplicate` and `source-missing` always read the task.
   If the candidate has a `source` field, the task's lines have shifted: that is its place in the current
   file, and `snippet` is shown around it. When the problem is still there — `backlog verify <ID> --source
   <that source>`.
3. Decide:

   | What the code shows | Command |
   |---|---|
   | The described problem is gone | `backlog close <ID> --as fixed --reason "Fixed in <sha>: <what exactly>"` (the CLI won't close it without an existing commit's hash) |
   | The code or feature the task is about is gone | `backlog close <ID> --as obsolete --reason "<what was removed and where>"` |
   | `source-missing`: the code moved (hint — `renamedTo`), the problem is still there | `backlog verify <ID> --source <new file:line>` |
   | `source-missing`: the code the task is about is gone | `backlog close <ID> --as obsolete --reason "<what was removed and where>"` |
   | `duplicate`: two tasks about the same thing | close the less complete one: `backlog close <ID> --as duplicate --duplicate-of <other> --reason "<what matches>"` |
   | `duplicate`: tasks about different things | confirm both: `backlog verify <ID>` and `backlog verify <other>` |
   | The problem is still there, but the code moved | `backlog verify <ID> --source <file:line>` |
   | The problem is still there, or you're not sure | `backlog verify <ID>`; several at once — `backlog verify <ID> <ID> …` |

   A plain `backlog verify <ID>` doesn't clear `source-missing`: a missing file leaves the candidates only
   with a new `--source` or by closing the task, otherwise the hook will keep reminding about it after
   every answer. Couldn't find where the code went — ask the user. A `duplicate` pair clears only once
   both tasks are confirmed.

   Only close with concrete evidence: a commit, a line, the fact the code is gone. "Looks outdated" is not
   evidence: confirm the task and leave it open. A closed task is deleted along with its file after 7
   days.

4. `problems` — a list of `{ kind, … }`. `file-not-parsed`: the file `path` doesn't parse, reasons in
   `problems` — fix the YAML by hand without changing `id`. List the rest for the user: `task-invalid` (error
   `problem` in task `taskId`), `fix-failed` (the fix wasn't written, reason `cause`), `epics-wait-for-files`,
   `project-without-repos`, `project-repos-missing`, `project-repo-not-git`, `project-history-unreadable`,
   `prefix-shared` (projects `projectIds` share one prefix — their task IDs collide).
5. End your answer with a block the user can use to find what was closed:
   ```
   Closed in the backlog:
   - SPA-14 — Upload timeout ignores file size: fixed in a1b2c3d
   ```
   Don't list confirmed tasks individually — "The rest of the tasks were confirmed" is enough.

If the hook asked for the re-check, just end your answer afterward: the hook doesn't fire twice in a row.

## Clean up stale minor tasks

When: the alert "Tasks with low priority older than 30 days", or a request to "clean up old tasks".

1. `backlog prune` — lists tasks with low priority older than 30 days that were never taken up. Changes
   nothing.
2. Show the list to the user and ask whether to cancel them. They can raise the priority of tasks they
   still need, or take them into progress.
3. Only after explicit agreement — `backlog prune --apply`: cancels them as `obsolete`.

## View the backlog

A project that's no longer maintained is marked inactive: `backlog project status <id> inactive` — its
tasks drop out of the combined "Projects" scope (list and stats) but stay available on the project's own
page. `backlog project list` shows the statuses. Deleting a project (`backlog project delete <id> --confirm
<id>`) removes the directory with all its tasks — do this only on the user's direct request.

"What's in the backlog" → `backlog list`: the current project's open tasks by priority. On request:
`--all-projects`, `--status done`, `--tag <tag>`, `--query <text>`. For details — `backlog show <ID>`.

Summary and alerts — `backlog stats`.

To change the category — `backlog category <ID> <category|none>`. To change the priority —
`backlog priority <ID> <low|medium|high|critical>`.
