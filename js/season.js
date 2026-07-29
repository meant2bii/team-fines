// Football half-seasons: spring runs February–July; autumn runs August–January.
// January belongs to the autumn season that began in the previous calendar year.
export function seasonForDate(date = new Date()) {
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  if (month === 1) return { year: year - 1, half: 'Podzim' };
  return { year, half: month >= 8 ? 'Podzim' : 'Jaro' };
}

export function seasonKey(season) {
  return `${season.year}-${season.half}`;
}
