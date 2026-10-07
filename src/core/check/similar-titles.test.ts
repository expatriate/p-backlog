import { describe, expect, it } from "vitest";
import { nearlySameTitles, similarTitles, titleStems } from "./similar-titles";

const similar = (a: string, b: string) => similarTitles(titleStems(a), titleStems(b));
const nearlySame = (a: string, b: string) => nearlySameTitles(titleStems(a), titleStems(b));

describe("similarTitles", () => {
  it("совпадают разные формы одних слов", () => {
    expect(similar("Таймаут загрузки не учитывает размер файла", "Загрузка: таймаут не учитывает большие файлы")).toBe(true);
    expect(similar("Ёлка не грузится в каталоге", "елка не грузится")).toBe(true);
  });

  it("одного общего слова мало, даже если заголовки короткие", () => {
    expect(similar("Таймаут загрузки", "Таймаут авторизации")).toBe(false);
  });

  it("длинным заголовкам хватает трёх общих слов, двух мало", () => {
    expect(similar("Клик по пункту меню хлебных крошек делает два перехода: к родителю и к выбранной папке", "В выпадающем списке навигации любой пункт ведёт к родителю текущей папки, а не к выбранному")).toBe(
      true,
    );
    expect(similar("Кэш каталога товаров сбрасывается при каждом деплое сервиса", "Каталог товаров отдаёт устаревшие цены клиентам и партнёрам")).toBe(false);
  });

  it("короткие слова не считаются", () => {
    expect(similar("Нет API для CSV", "Нет API для XML")).toBe(false);
  });
});

describe("nearlySameTitles", () => {
  it("тот же заголовок с другим порядком слов — да; общее начало заголовков групп «Мелочи ревью» — нет", () => {
    expect(nearlySame("Загрузка: таймаут не учитывает размер файла", "Таймаут загрузки не учитывает размер файла")).toBe(true);
    expect(nearlySame("Мелочи ревью кодовой базы: сервер и веб-статистика", "Мелочи ревью кодовой базы: статистика, проверка и код")).toBe(false);
  });

  it("короткие слова различают почти одинаковые заголовки", () => {
    expect(nearlySame("Мелочи ревью: CLI", "Мелочи ревью: API")).toBe(false);
    expect(nearlySame("Задача SPA-3", "Задача SPA-9")).toBe(false);
  });
});
