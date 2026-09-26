# Security Policy

## Supported versions

Only the latest release published to npm (`npm view p-backlog version`) receives security fixes. Update with
`npm update -g p-backlog`.

## Reporting a vulnerability

Please do not open a public issue. Report privately through GitHub:
[Report a vulnerability](https://github.com/expatriate/p-backlog/security/advisories/new) on the repository's Security tab.

Include the version, your OS and Node.js version, steps to reproduce, and what an attacker could achieve. You will get an
answer within a week; a fix is released as a patch version and credited in the advisory unless you prefer otherwise.

## Scope

p-backlog is a local tool. Things that are in scope:

- the web server (`backlog serve`, the autostart service): it must listen on `127.0.0.1` only and reject requests with a
  foreign `Host` header or cross-site writes;
- anything that lets a web page, a repository or a task file make the CLI, the server or the agent hooks run commands,
  read or write files outside the backlog directory, or leak data;
- the Stop hooks and plugin scripts that `backlog setup` and the Claude Code plugin install;
- the npm package and its publishing pipeline.

Out of scope: attacks that already require write access to your user account or your backlog directory, and
vulnerabilities in dependencies without a way to reach them through p-backlog (report those upstream).
