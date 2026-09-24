import { describe, expect, it } from "vitest";
import { compareIds, derivePrefix, deriveProjectId, parseId } from "./ids";

describe("parseId", () => {
  it("разбирает префикс и номер", () => {
    expect(parseId("SPA-12")).toEqual({ prefix: "SPA", number: 12 });
    expect(parseId("TI2-5")).toEqual({ prefix: "TI2", number: 5 });
  });

  it.each(["spa-1", "SPA-0", "SPA-01", "SPA", "-1", "1A-2", "ABCDEFGHIJK-1"])("отклоняет %s", (id) => {
    expect(parseId(id)).toBeNull();
  });
});

describe("compareIds", () => {
  it("сортирует по префиксу, затем по номеру как по числу", () => {
    expect(["SPA-10", "SPA-2", "AB-1"].sort(compareIds)).toEqual(["AB-1", "SPA-2", "SPA-10"]);
  });
});

describe("derivePrefix", () => {
  it.each([
    ["spa", "SPA"],
    ["partner-workspace", "PW"],
    ["torg.io", "TI"],
    ["frontend", "FRON"],
    ["a-b-c-d-e", "ABCD"],
    ["2gis", "P2GIS"],
    ["проект", "PROJ"],
  ])("%s → %s", (basename, expected) => {
    expect(derivePrefix(basename, new Set())).toBe(expected);
  });

  it("добавляет цифру к занятому префиксу", () => {
    expect(derivePrefix("spa", new Set(["SPA", "SPA2"]))).toBe("SPA3");
  });
});

describe("deriveProjectId", () => {
  it.each([
    ["torg.io", "torg-io"],
    ["My Repo", "my-repo"],
    ["проект", "project"],
  ])("%s → %s", (basename, expected) => {
    expect(deriveProjectId(basename, new Set())).toBe(expected);
  });

  it("добавляет суффикс к занятому id", () => {
    expect(deriveProjectId("spa", new Set(["spa"]))).toBe("spa-2");
  });
});
