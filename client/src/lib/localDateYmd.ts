/**
 * Data do calendário local em YYYY-MM-DD (útil para filtros que batem com DATE no BR).
 * `toISOString()` usa UTC e pode mudar o dia/mês perto da meia-noite em BRT.
 */
export function localDateYmd(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
