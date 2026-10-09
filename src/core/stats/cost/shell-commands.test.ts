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
