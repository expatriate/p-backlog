import { describe, expect, it } from "vitest";
import { invokesBacklog } from "./shell-commands";

describe("начало heredoc", () => {
  it('тело не считается командой при любой записи: <<EOF, <<-EOF, << "EOF", два heredoc в одной строке', () => {
    const scripts = ["cat <<EOF\nbacklog list\nEOF", "cat <<-EOF\n\tbacklog list\n\tEOF", 'cat << "EOF"\nbacklog list\nEOF', "cat <<A <<'B'\nbacklog list\nA\nbacklog stats\nB"];

    expect(scripts.map(invokesBacklog)).toEqual([false, false, false, false]);
  });

  it("команда после закрывающей строки <<-'EOF' с отступом считается", () => {
    expect(invokesBacklog("cat <<-'EOF' > notes.md\n\ttext\n\tEOF\nbacklog list")).toBe(true);
  });
});
