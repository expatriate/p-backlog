import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadBacklog } from "../../core/store/load";
import { makeGitRepo } from "../../core/store/testing/temp-dirs";
import { EXIT } from "../io";
import { makeCliSandbox } from "../testing/cli-harness";

describe("backlog project", () => {
  it.each([[["list", "garbage"]], [["list", "--confirm", "x"]], [["status", "spa", "active", "--confirm", "spa"]]])("лишние аргументы %j отклоняет кодом 1", async (argv) => {
    const { run } = await makeCliSandbox();

    expect((await run(["project", ...argv])).code).toBe(EXIT.invalid);
  });

  it("list печатает статус и число открытых, status переключает активность", async () => {
    const { run, home } = await makeCliSandbox();
    await run(["new", "--category", "bug", "--title", "Задача"]);

    expect((await run(["project", "list"])).out).toMatch(/^spa · .* · SPA · активен · открытых 1$/);

    expect(await run(["project", "status", "spa", "inactive"])).toMatchObject({ code: EXIT.ok, out: "spa: активен → неактивен" });
    expect((await run(["project", "list"])).out).toContain("неактивен");
    expect((await run(["list", "--all-projects"], { cwd: home })).out).toBe("Задач не найдено");

    expect(await run(["project", "status", "spa", "active"])).toMatchObject({ code: EXIT.ok, out: "spa: неактивен → активен" });
    expect(await run(["project", "status", "spa", "active"])).toMatchObject({ code: EXIT.ok, out: "spa: уже активен" });
    expect((await run(["project", "status", "нет-такого", "active"])).code).toBe(EXIT.notFound);
    expect((await run(["project", "status", "spa", "включить"])).code).toBe(EXIT.invalid);
    expect((await run(["project", "чего"])).code).toBe(EXIT.invalid);
  });

  it("project.md не в UTF-8 не переписывается при смене активности", async () => {
    const { run, root } = await makeCliSandbox();
    await run(["new", "--category", "bug", "--title", "Задача"]);
    const path = join(root, "spa/project.md");
    const cp1251Note = Buffer.from([0xcf, 0xf0, 0xee, 0xe5, 0xea, 0xf2, 0x0a]);
    await writeFile(path, Buffer.concat([await readFile(path), cp1251Note]));
    const before = await readFile(path);

    const result = await run(["project", "status", "spa", "inactive"]);

    expect(result.code).toBe(EXIT.invalid);
    expect(result.err).toContain("UTF-8");
    expect((await readFile(path)).equals(before)).toBe(true);
  });

  describe("сломанный project.md назван с причиной вместо «не найден» и «Проектов нет»", () => {
    const unparsed = (path: string) => `Проект не загружен: ${path} не разобран`;

    it("свой проект — по каталогу репозитория и по --project из любого места; чужой сломанный не упоминается", async () => {
      const { run, root, home } = await makeCliSandbox();
      await run(["new", "--category", "bug", "--title", "Задача"]);
      const own = join(root, "spa", "project.md");
      const foreign = join(root, "other", "project.md");
      await writeFile(own, "без frontmatter\n");
      await mkdir(join(root, "other"));
      await writeFile(foreign, "repos: [~/elsewhere]\n");

      const runs: { argv: string[]; cwd?: string }[] = [{ argv: ["list"] }, { argv: ["take", "--next"] }, { argv: ["list", "--project", "spa"], cwd: home }];
      for (const { argv, cwd } of runs) {
        const result = await run(argv, cwd === undefined ? {} : { cwd });
        expect(result.code).toBe(EXIT.notFound);
        expect(result.err).toContain(unparsed(own));
        expect(result.err).not.toContain(foreign);
        expect(result.err).not.toContain("не найден");
      }
      const listed = await run(["project", "list"]);
      expect(listed).toMatchObject({ code: EXIT.ok, out: "" });
      expect(listed.err).toContain(unparsed(own));
      expect(listed.err).toContain(unparsed(foreign));
    });

    it("repos на родителе репозитория — проект назван, и new не заводит рядом новый", async () => {
      const { run, root } = await makeCliSandbox();
      const path = join(root, "work", "project.md");
      await mkdir(join(root, "work"), { recursive: true });
      await writeFile(path, "name: work\nrepos: [~/projects]\n");

      expect((await run(["list"])).err).toContain(unparsed(path));
      expect((await run(["new", "--category", "bug", "--title", "Задача"])).err).toContain(`Проект не создан: ${path} не разобран`);
      expect((await loadBacklog(root)).projects).toEqual([]);
    });

    it("сломанный project.md вложенного репозитория не уступает задачи разобранному проекту родительского каталога", async () => {
      const { run, root } = await makeCliSandbox();
      await mkdir(join(root, "work"), { recursive: true });
      await writeFile(join(root, "work", "project.md"), "---\nname: work\nprefix: WK\nrepos: [~/projects]\n---\n");
      const nested = join(root, "spa", "project.md");
      await mkdir(join(root, "spa"), { recursive: true });
      await writeFile(nested, "repos: [~/projects/spa]\n");

      const created = await run(["new", "--category", "bug", "--title", "Задача"]);
      const listed = await run(["list"]);

      expect(created.code).toBe(EXIT.notFound);
      expect(created.err).toContain(`Проект не создан: ${nested} не разобран`);
      expect((await loadBacklog(root)).tasks).toEqual([]);
      expect(listed.err).toContain(unparsed(nested));
    });

    it.each([
      { case: "сломанный project.md в своём каталоге проекта без repos", brokenDir: "spa", brokenText: "без frontmatter\n", cwd: "projects/spa" },
      { case: "каталог вне git", brokenDir: "notes", brokenText: "repos: [~/projects/plain]\n", cwd: "projects/plain" },
    ])("$case — new не уходит в родительский проект", async ({ brokenDir, brokenText, cwd }) => {
      const { run, root, home } = await makeCliSandbox();
      await mkdir(join(home, cwd), { recursive: true });
      await mkdir(join(root, "work"), { recursive: true });
      await writeFile(join(root, "work", "project.md"), "---\nname: work\nprefix: WK\nrepos: [~/projects]\n---\n");
      const broken = join(root, brokenDir, "project.md");
      await mkdir(join(root, brokenDir), { recursive: true });
      await writeFile(broken, brokenText);

      const created = await run(["new", "--category", "bug", "--title", "Задача"], { cwd: join(home, cwd) });

      expect(created.err).toContain(`Проект не создан: ${broken} не разобран`);
      expect((await loadBacklog(root)).tasks).toEqual([]);
    });

    it("сломанный project.md чужого репозитория с тем же именем не отнимает каталог у его разобранного проекта", async () => {
      const { run, root, home } = await makeCliSandbox();
      await run(["new", "--category", "bug", "--title", "Задача"]);
      await writeFile(join(root, "spa", "project.md"), "без frontmatter\n");
      const namesake = await makeGitRepo(home, "work/spa");
      await mkdir(join(root, "spa-2"));
      await writeFile(join(root, "spa-2", "project.md"), "---\nname: spa\nprefix: SPB\nrepos: [~/work/spa]\n---\n");

      const created = await run(["new", "--category", "bug", "--title", "Своя"], { cwd: namesake });

      expect(created.code).toBe(EXIT.ok);
      expect((await loadBacklog(root)).tasks.map((task) => task.id)).toEqual(["SPB-1"]);
    });

    it("каталог вне git с именем репозитория не приписывает себе его сломанный project.md", async () => {
      const { run, root, home } = await makeCliSandbox();
      await run(["new", "--category", "bug", "--title", "Задача"]);
      await writeFile(join(root, "spa", "project.md"), "без frontmatter\n");
      const lookalike = join(home, "Downloads", "spa");
      await mkdir(lookalike, { recursive: true });

      const result = await run(["list"], { cwd: lookalike });

      expect(result).toMatchObject({ code: EXIT.notFound, err: expect.stringContaining(`Проект для ${lookalike} не найден`) });
      expect(result.err).not.toContain(join(root, "spa", "project.md"));
    });

    it("repos на каталоге вне git — проект назван при запуске из этого каталога", async () => {
      const { run, root, home } = await makeCliSandbox();
      const plain = join(home, "plain");
      const path = join(root, "notes", "project.md");
      await mkdir(plain);
      await mkdir(join(root, "notes"), { recursive: true });
      await writeFile(path, "repos: [~/plain]\n");

      expect((await run(["list"], { cwd: plain })).err).toContain(unparsed(path));
    });
  });

  it("delete удаляет проект только с точным подтверждением", async () => {
    const { run, root } = await makeCliSandbox();
    await run(["new", "--category", "bug", "--title", "Задача"]);

    const noConfirm = await run(["project", "delete", "spa"]);
    expect(noConfirm).toMatchObject({ code: EXIT.invalid, err: "Подтвердите удаление: backlog project delete spa --confirm spa" });
    expect((await run(["project", "delete", "spa", "--confirm", "SPA"])).code).toBe(EXIT.invalid);
    expect((await loadBacklog(root)).projects).toHaveLength(1);

    expect(await run(["project", "delete", "spa", "--confirm", "spa"])).toMatchObject({ code: EXIT.ok, out: "spa удалён: задач 1" });
    expect((await loadBacklog(root)).projects).toEqual([]);
    expect((await run(["project", "delete", "spa", "--confirm", "spa"])).code).toBe(EXIT.notFound);
  });

  it("ID в другом регистре не находит проект: delete не удаляет каталог, status не правит project.md", async () => {
    const { run, root } = await makeCliSandbox();
    await run(["new", "--category", "bug", "--title", "Задача"]);
    const projectFile = join(root, "spa", "project.md");
    const before = await readFile(projectFile, "utf8");

    expect(await run(["project", "status", "SPA", "inactive"])).toMatchObject({ code: EXIT.notFound, err: expect.stringContaining("SPA") });
    expect(await run(["project", "delete", "SPA", "--confirm", "SPA"])).toMatchObject({ code: EXIT.notFound, out: "" });

    expect(await readFile(projectFile, "utf8")).toBe(before);
  });
});
