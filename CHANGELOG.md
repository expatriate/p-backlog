# Changelog

## 0.2.1

- npm keywords match the GitHub topics, so the package is easier to find in npm search. No code changes.

## 0.2.0

- Two interface languages: Russian and English (`backlog config language`, RU/EN switch in the web UI).
- Installable as an npm package: `npm i -g p-backlog`.
- `backlog setup` installs the agent skill and the Stop hook (replaces `npm run install-skill` from a clone).
- `backlog serve` runs the web UI; `backlog service install|uninstall|status` starts it at login on macOS (launchd), Linux (systemd --user) and Windows (Startup folder).
- Claude Code directory respects `CLAUDE_CONFIG_DIR`.
