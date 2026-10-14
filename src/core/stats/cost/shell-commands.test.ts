import { describe, expect, it } from "vitest";
import { invokesBacklog } from "./shell-commands";

describe("начало heredoc", () => {
  it("тело не считается командой при любой записи маркера, после перенаправления и при двух heredoc в одной строке", () => {
    const scripts = [
      "cat <<EOF\nbacklog list\nEOF",
      "cat <<-EOF\n\tbacklog list\n\tEOF",
      'cat << "EOF"\nbacklog list\nEOF',
      "cat <<'EOF' > notes.md\nbacklog list\nEOF",
      "cat <<A <<'B'\nbacklog list\nA\nbacklog stats\nB",
    ];

    expect(scripts.map(invokesBacklog)).toEqual([false, false, false, false, false]);
  });

  it("тело heredoc в подстановке внутри кавычек не считается командой", () => {
    expect(invokesBacklog('git commit -m "$(cat <<\'EOF\'\nfix: one " quote\nbacklog list now\nEOF\n)"')).toBe(false);
  });

  it("сдвиг << в арифметике не начинает heredoc: команда на следующей строке считается", () => {
    expect(["echo $((1 << 3))\nbacklog list", "n=$((1<<10))\nbacklog stats"].map(invokesBacklog)).toEqual([true, true]);
  });

  it("команда, которой heredoc подан на вход, считается", () => {
    expect(invokesBacklog("backlog new --title x <<'EOF'\nтело\nEOF")).toBe(true);
  });

  it("команда после закрывающей строки <<-'EOF' с отступом считается", () => {
    expect(invokesBacklog("cat <<-'EOF' > notes.md\n\ttext\n\tEOF\nbacklog list")).toBe(true);
  });
});

describe("вызов backlog", () => {
  it("узнаётся после присваиваний окружения, а пути и похожие слова — нет", () => {
    expect(["BACKLOG_DIR=/tmp/x backlog list", "cd x; FOO=1 BAR=2 backlog show PB-1", "backlog", "git status && backlog check --json"].map(invokesBacklog)).toEqual([true, true, true, true]);
    expect(["ls backlog/", "cat ~/backlog/p/PB-1.md", "backlog-web start", "echo backlogs"].map(invokesBacklog)).toEqual([false, false, false, false]);
  });

  it("узнаётся в подоболочке, подстановке и через npx, но не внутри строк", () => {
    expect(["(cd x; backlog list)", "echo $(backlog list --json)", "npx p-backlog stats", "npx -y p-backlog list"].map(invokesBacklog)).toEqual([true, true, true, true]);
    expect(['git commit -m "fix\n\nbacklog list"', "echo 'a; backlog list'"].map(invokesBacklog)).toEqual([false, false]);
  });

  it("узнаётся за ключевыми словами оболочки, обёртками, путём к бинарнику и раннерами пакетов", () => {
    const invoking = [
      "for id in PB-1 PB-2; do backlog show $id; done",
      "if backlog list; then echo ok; fi",
      "! backlog check",
      "time backlog list",
      "env FOO=1 backlog list",
      "timeout 30 backlog check",
      "xargs -n 1 backlog show < ids",
      "sudo -E backlog list",
      "./node_modules/.bin/backlog list",
      "backlog.cmd list",
      "npx p-backlog@latest stats",
      "npx --package=p-backlog backlog list",
      "npx -p p-backlog backlog list",
      "pnpm dlx p-backlog list",
      "bunx p-backlog list",
      'echo "$(backlog list --json)"',
      "command backlog list",
      "\\backlog list",
      "sudo -u user backlog list",
      "xargs -I % backlog show %",
      "env -u VAR backlog list",
      "timeout -s KILL 30 backlog check",
      "npx backlog list",
      "npm exec backlog list",
      "pnpm exec backlog list",
      "yarn backlog list",
    ];
    const notInvoking = ["command -v backlog", "npx eslint p-backlog", "echo x # ; backlog list"];

    expect(invoking.filter((command) => !invokesBacklog(command))).toEqual([]);
    expect(notInvoking.filter(invokesBacklog)).toEqual([]);
  });
});
