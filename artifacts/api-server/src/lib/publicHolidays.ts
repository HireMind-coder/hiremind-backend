// Suggestions shown on the "Holiday List" screen (the ADD buttons / "Add all Public Holidays").
//
// FIXED_DATE_HOLIDAYS repeat on the same date every year, so they work for any year.
// Festivals that follow the lunar calendar (Holi, Diwali, Eid, etc.) change every year —
// add them to YEARLY_HOLIDAYS below once the government calendar for that year is published.

export type HolidaySuggestion = { date: string; name: string };

const FIXED_DATE_HOLIDAYS: Array<[string, string]> = [
  ["01-26", "Republic Day"],
  ["04-14", "Dr. Ambedkar Jayanti"],
  ["08-15", "Independence Day"],
  ["10-02", "Gandhi Jayanti"],
  ["12-25", "Christmas"],
];

// Example:  2027: [["2027-03-22", "Holi"], ["2027-11-08", "Diwali"]],
// (fill with dates from the official gazetted holiday list)
const YEARLY_HOLIDAYS: Record<number, Array<[string, string]>> = {};

export function getPublicHolidaySuggestions(year: number): HolidaySuggestion[] {
  const fixed = FIXED_DATE_HOLIDAYS.map(([md, name]) => ({ date: `${year}-${md}`, name }));
  const yearly = (YEARLY_HOLIDAYS[year] ?? []).map(([date, name]) => ({ date, name }));
  return [...fixed, ...yearly].sort((a, b) => a.date.localeCompare(b.date));
}