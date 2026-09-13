export function laborTime(value) {
  if (value == null || String(value).trim() === '') return '';
  const hours = Number(value);
  if (!Number.isFinite(hours) || hours < 0) return '';
  if (hours > 0 && hours * 60 < 1) return '<1 min';
  const minutes = Math.round(hours * 60);
  return `${Math.floor(minutes / 60)} hr ${minutes % 60} min`;
}
