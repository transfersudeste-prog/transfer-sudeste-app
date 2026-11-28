// Calendar dates are business dates in Rio de Janeiro, not browser-local dates.
export function businessDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone:'America/Sao_Paulo', year:'numeric', month:'2-digit', day:'2-digit'}).formatToParts(now);
  const part = type => parts.find(p => p.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
function parseDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new RangeError('Data inválida');
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(+date) || date.toISOString().slice(0,10) !== value) throw new RangeError('Data inválida');
  return date;
}
const iso = date => date.toISOString().slice(0,10);
export function ownerPeriod(kind, {now = new Date(), start, end} = {}) {
  const today = businessDate(now);
  const date = parseDate(today);
  if (kind === 'today') return {start:today,end:today};
  if (kind === 'week') {
    date.setUTCDate(date.getUTCDate() - (date.getUTCDay()+6)%7);
    const first = iso(date);
    date.setUTCDate(date.getUTCDate()+6);
    return {start:first,end:iso(date)};
  }
  if (kind === 'month') {
    date.setUTCDate(1);
    const first = iso(date);
    date.setUTCMonth(date.getUTCMonth()+1,0);
    return {start:first,end:iso(date)};
  }
  if (kind === 'custom') {
    parseDate(start); parseDate(end);
    if (start > end) throw new RangeError('A data inicial deve anteceder a final');
    return {start,end};
  }
  throw new RangeError('Período inválido');
}
