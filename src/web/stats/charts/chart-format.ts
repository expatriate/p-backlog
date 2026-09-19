const compact = new Intl.NumberFormat("ru-RU", { notation: "compact", maximumFractionDigits: 1 });

function localDay(day: string): Date {
  return new Date(`${day.slice(0, 10)}T00:00:00`);
}

export function axisDay(day: string): string {
  return localDay(day).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

export function tooltipDay(day: string): string {
  return localDay(day).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

export function tooltipWeek(start: string): string {
  return `неделя с ${tooltipDay(start)}`;
}

export function axisTime(at: string): string {
  return new Date(at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export function tooltipTime(at: string): string {
  return new Date(at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function compactNumber(value: number): string {
  return compact.format(value);
}
