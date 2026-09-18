import { describe, expect, it } from "vitest";
import { similarTitles } from "./similar-titles";

describe("similarTitles", () => {
  it("совпадают разные формы одних слов", () => {
    expect(similarTitles("Таймаут загрузки не учитывает размер файла", "Загрузка: таймаут не учитывает большие файлы")).toBe(true);
    expect(similarTitles("Ёлка не грузится в каталоге", "елка не грузится")).toBe(true);
  });

  it("одного общего слова мало, даже если заголовки короткие", () => {
    expect(similarTitles("Таймаут загрузки", "Таймаут авторизации")).toBe(false);
  });

  it("общих слов должно быть не меньше половины более короткого заголовка", () => {
    expect(similarTitles("Кэш каталога товаров сбрасывается при каждом деплое сервиса", "Каталог товаров отдаёт устаревшие цены клиентам и партнёрам")).toBe(false);
  });

  it("короткие слова не считаются", () => {
    expect(similarTitles("Нет API для CSV", "Нет API для XML")).toBe(false);
  });
});
