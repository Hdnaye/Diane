// French locale for react-native-calendars, built from date-fns so names match the rest of the app.
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { LocaleConfig } from 'react-native-calendars';

const months = Array.from({ length: 12 }, (_, month) => new Date(2026, month, 1));
// 4 January 2026 is a Sunday: react-native-calendars expects the days from Sunday.
const days = Array.from({ length: 7 }, (_, day) => new Date(2026, 0, 4 + day));

LocaleConfig.locales.fr = {
  monthNames: months.map((date) => format(date, 'LLLL', { locale: fr })),
  monthNamesShort: months.map((date) => format(date, 'LLL', { locale: fr })),
  dayNames: days.map((date) => format(date, 'EEEE', { locale: fr })),
  dayNamesShort: days.map((date) => format(date, 'EEE', { locale: fr })),
  today: "Aujourd'hui",
};
LocaleConfig.defaultLocale = 'fr';

/** Weeks start on Monday in France. */
export const FIRST_DAY_OF_WEEK = 1;
