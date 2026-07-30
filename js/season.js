// Football years run from 1 July through 30 June, e.g. 2026/27.
export function seasonForDate(date = new Date()) {
  const year = date.getFullYear() - (date.getMonth() < 6 ? 1 : 0);
  return { year };
}

export function seasonKey(season) {
  return `${season.year}/${String(Number(season.year) + 1).slice(-2)}`;
}
