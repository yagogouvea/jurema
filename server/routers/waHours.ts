/**
 * Horários de atendimento / ausência — sempre em America/Sao_Paulo.
 * awaySchedule: JSON por dia da semana (0=domingo … 6=sábado, igual JS Date.getDay()).
 */

export type AwayDayKey = "0" | "1" | "2" | "3" | "4" | "5" | "6";

/** legacy = mesma janela awayEnd–awayStart de wa_ai_config para aquele dia */
export type AwayDayRule =
  | { mode: "legacy" }
  | { mode: "closed" }
  | { mode: "open"; start: string; end: string };

export type AwaySchedule = Partial<Record<AwayDayKey, AwayDayRule>>;

const WD: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

/** Hora e dia da semana no fuso de São Paulo */
export function getSaoPauloDayAndMinutes(d = new Date()): { weekday: number; minutes: number } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = formatter.formatToParts(d);
  let hour = 0;
  let minute = 0;
  let weekday = 0;
  for (const p of parts) {
    if (p.type === "weekday") weekday = WD[p.value] ?? 0;
    if (p.type === "hour") hour = parseInt(p.value, 10) || 0;
    if (p.type === "minute") minute = parseInt(p.value, 10) || 0;
  }
  return { weekday, minutes: hour * 60 + minute };
}

/** Loja aberta entre openStart e openEnd (HH:mm). Se end < start, cruza meia-noite. */
export function isMinutesInWindow(cur: number, openStart: string, openEnd: string): boolean {
  const parse = (s: string) => {
    const [h, m] = s.split(":").map((x) => parseInt(x, 10));
    return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
  };
  const os = parse(openStart);
  const oe = parse(openEnd);
  if (os === oe) return false;
  if (os < oe) return cur >= os && cur < oe;
  return cur >= os || cur < oe;
}

export function parseAwaySchedule(raw: unknown): AwaySchedule | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t || t === "null") return null;
    try {
      const j = JSON.parse(t) as AwaySchedule;
      return j && typeof j === "object" ? j : null;
    } catch {
      return null;
    }
  }
  if (typeof raw === "object") return raw as AwaySchedule;
  return null;
}

/**
 * A loja está em horário de atendimento (aberta) agora em SP?
 * awayStart/awayEnd: semântica legada — loja ABRE em awayEnd e FECHA em awayStart (ex: 06–15).
 */
export function isStoreOpenNowSaoPaulo(cfg: {
  awayEnabled: boolean;
  awayStart: string | null;
  awayEnd: string | null;
  awaySchedule: unknown;
}): boolean {
  if (!cfg.awayEnabled) return true;

  const schedule = parseAwaySchedule(cfg.awaySchedule);
  const { weekday, minutes } = getSaoPauloDayAndMinutes();
  const dayKey = String(weekday) as AwayDayKey;

  const hasCustomSchedule =
    schedule &&
    typeof schedule === "object" &&
    Object.keys(schedule).some((k) => {
      const rule = schedule[k as AwayDayKey];
      return rule && typeof rule === "object" && "mode" in rule;
    });

  if (hasCustomSchedule) {
    const rule = schedule![dayKey];
    if (!rule || !("mode" in rule)) {
      // dia sem regra: usa legado do cadastro
      if (cfg.awayStart && cfg.awayEnd) {
        return isWithinBusinessHoursSp(cfg.awayStart, cfg.awayEnd);
      }
      return true;
    }
    if (rule.mode === "closed") return false;
    if (rule.mode === "legacy") {
      if (cfg.awayStart && cfg.awayEnd) return isWithinBusinessHoursSp(cfg.awayStart, cfg.awayEnd);
      return true;
    }
    if (rule.mode === "open" && rule.start && rule.end) {
      return isMinutesInWindow(minutes, rule.start, rule.end);
    }
    return true;
  }

  if (cfg.awayStart && cfg.awayEnd) {
    return isWithinBusinessHoursSp(cfg.awayStart, cfg.awayEnd);
  }
  return true;
}

/** Igual isWithinBusinessHours, mas usando relógio de São Paulo (não UTC do servidor). */
export function isWithinBusinessHoursSp(awayStart: string, awayEnd: string): boolean {
  const { minutes: currentMinutes } = getSaoPauloDayAndMinutes();
  const [startH, startM] = awayStart.split(":").map(Number);
  const [endH, endM] = awayEnd.split(":").map(Number);
  const closeMinutes = startH * 60 + startM;
  const openMinutes = endH * 60 + endM;

  if (openMinutes < closeMinutes) {
    return currentMinutes >= openMinutes && currentMinutes < closeMinutes;
  }
  return currentMinutes >= openMinutes || currentMinutes < closeMinutes;
}
