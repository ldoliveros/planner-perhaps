import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday as isTodayFns,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { es } from "date-fns/locale";

export function getWeekDays(anchor: Date): Date[] {
  const start = startOfWeek(anchor, { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function getMonthGridDays(anchor: Date): Date[] {
  const gridStart = startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 });
  return eachDayOfInterval({ start: gridStart, end: gridEnd });
}

export function isSameMonthAs(day: Date, anchor: Date): boolean {
  return isSameMonth(day, anchor);
}

export function formatDayAbbr(date: Date): string {
  return format(date, "EEE", { locale: es }).toUpperCase().replace(".", "");
}

export function formatDayNumber(date: Date): string {
  return format(date, "d");
}

export function formatMonthYear(date: Date): string {
  const label = format(date, "LLLL yyyy", { locale: es });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function formatWeekRange(days: Date[]): string {
  const first = days[0];
  const last = days[days.length - 1];
  const sameMonth = format(first, "MM") === format(last, "MM");
  if (sameMonth) {
    return `${format(first, "d")} – ${format(last, "d")} de ${format(last, "LLLL", { locale: es })}`;
  }
  return `${format(first, "d MMM", { locale: es })} – ${format(last, "d MMM", { locale: es })}`;
}

export function formatFullDateFromDate(date: Date): string {
  const label = format(date, "EEEE d 'de' LLLL", { locale: es });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function formatFullDate(dateIso: string): string {
  return formatFullDateFromDate(new Date(`${dateIso}T00:00:00`));
}

export function isSameDayAs(dateIso: string, day: Date): boolean {
  return isSameDay(new Date(`${dateIso}T00:00:00`), day);
}

export function isToday(day: Date): boolean {
  return isTodayFns(day);
}
