const chineseLunarDayNames = [
  "",
  "初一",
  "初二",
  "初三",
  "初四",
  "初五",
  "初六",
  "初七",
  "初八",
  "初九",
  "初十",
  "十一",
  "十二",
  "十三",
  "十四",
  "十五",
  "十六",
  "十七",
  "十八",
  "十九",
  "二十",
  "廿一",
  "廿二",
  "廿三",
  "廿四",
  "廿五",
  "廿六",
  "廿七",
  "廿八",
  "廿九",
  "三十",
];

const bareChineseLunarDays: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
};

export function normalizeChineseLunarDayText(text: string) {
  const dayText = text.trim().replace(/日$/, "");
  const dayNumber = Number(dayText);

  if (Number.isInteger(dayNumber)) {
    return formatChineseLunarDayNumber(dayNumber) ?? dayText;
  }

  const bareDayNumber = bareChineseLunarDays[dayText];
  if (bareDayNumber !== undefined) {
    return formatChineseLunarDayNumber(bareDayNumber) ?? dayText;
  }

  return dayText;
}

export function normalizeChineseLunarDateText(text: string) {
  const dateText = text.trim();
  const normalizedDateText = dateText.replace(/日$/, "");
  const match = normalizedDateText.match(/^(.*?)(\d{1,2})$/);

  if (match) {
    const [, prefix, dayText] = match;
    const dayName = formatChineseLunarDayNumber(Number(dayText));
    return dayName ? `${prefix}${dayName}` : dateText;
  }

  if (
    chineseLunarDayNames.some(
      (dayName) => dayName && normalizedDateText.endsWith(dayName),
    )
  ) {
    return normalizedDateText;
  }

  for (const [bareDayText, dayNumber] of Object.entries(bareChineseLunarDays)) {
    if (normalizedDateText.endsWith(bareDayText)) {
      const prefix = normalizedDateText.slice(0, -bareDayText.length);
      const dayName = formatChineseLunarDayNumber(dayNumber);
      return dayName ? `${prefix}${dayName}` : dateText;
    }
  }

  return dateText;
}

function formatChineseLunarDayNumber(day: number) {
  if (!Number.isInteger(day) || day < 1 || day >= chineseLunarDayNames.length) {
    return null;
  }

  return chineseLunarDayNames[day];
}
