/**
 * Datas de calendário em America/Sao_Paulo — alinhar filtros do PDV ao mesmo “dia de pedido”
 * usado em `CONVERT_TZ(createdAt, '+00:00', '-03:00')` no MySQL.
 */

export const SAO_PAULO_TZ = "America/Sao_Paulo";

export function formatYmdInTimeZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function todayYmdSaoPaulo(date: Date = new Date()): string {
  return formatYmdInTimeZone(date, SAO_PAULO_TZ);
}

export function yesterdayYmdSaoPaulo(date: Date = new Date()): string {
  const today = todayYmdSaoPaulo(date);
  const ms = new Date(`${today}T12:00:00-03:00`).getTime() - 86400000;
  return formatYmdInTimeZone(new Date(ms), SAO_PAULO_TZ);
}

export function firstOfMonthYmdSaoPaulo(date: Date = new Date()): string {
  const ymd = todayYmdSaoPaulo(date);
  return `${ymd.slice(0, 7)}-01`;
}

/** Último dia do mês corrente no calendário de SP (YYYY-MM-DD). */
export function lastOfMonthYmdSaoPaulo(date: Date = new Date()): string {
  const cur = todayYmdSaoPaulo(date);
  const y = Number(cur.slice(0, 4));
  const m = Number(cur.slice(5, 7));
  const nextMonth = m === 12 ? 1 : m + 1;
  const nextYear = m === 12 ? y + 1 : y;
  const firstNext = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
  const ms = new Date(`${firstNext}T00:00:00-03:00`).getTime() - 86400000;
  return formatYmdInTimeZone(new Date(ms), SAO_PAULO_TZ);
}

/** Avança ou retrocede dias no calendário de SP (meio-dia local evita bordas). */
export function addCalendarDaysYmdSaoPaulo(ymd: string, deltaDays: number): string {
  const ms = new Date(`${ymd}T12:00:00-03:00`).getTime() + deltaDays * 86400000;
  return formatYmdInTimeZone(new Date(ms), SAO_PAULO_TZ);
}

function weekdaySun0FromYmdSp(ymd: string): number {
  const wd = new Date(`${ymd}T12:00:00-03:00`).toLocaleDateString("en-US", {
    timeZone: SAO_PAULO_TZ,
    weekday: "short",
  });
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[wd] ?? 0;
}

/** Segunda-feira da semana de `date` em São Paulo (YYYY-MM-DD). */
export function mondayOfWeekYmdSaoPaulo(date: Date = new Date()): string {
  const ymd = todayYmdSaoPaulo(date);
  const wd = weekdaySun0FromYmdSp(ymd);
  const daysBack = wd === 0 ? 6 : wd - 1;
  return addCalendarDaysYmdSaoPaulo(ymd, -daysBack);
}

export function firstDayOfPreviousMonthYmdSaoPaulo(date: Date = new Date()): string {
  const cur = todayYmdSaoPaulo(date);
  const y = Number(cur.slice(0, 4));
  const m = Number(cur.slice(5, 7));
  const prevMonth = m === 1 ? 12 : m - 1;
  const prevYear = m === 1 ? y - 1 : y;
  return `${prevYear}-${String(prevMonth).padStart(2, "0")}-01`;
}

export function lastDayOfPreviousMonthYmdSaoPaulo(date: Date = new Date()): string {
  const firstThis = firstOfMonthYmdSaoPaulo(date);
  const ms = new Date(`${firstThis}T00:00:00-03:00`).getTime() - 86400000;
  return formatYmdInTimeZone(new Date(ms), SAO_PAULO_TZ);
}
