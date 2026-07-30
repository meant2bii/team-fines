// Football half-seasons: spring runs January–June; autumn runs July–December.
export function seasonForDate(date = new Date()) {
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  return { year, half: month >= 7 ? 'Podzim' : 'Jaro' };
}

export function seasonKey(season) {
  return `${season.year}-${season.half}`;
}
