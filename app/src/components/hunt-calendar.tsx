import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { Calendar, type CalendarProps, type DateData } from 'react-native-calendars';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { FIRST_DAY_OF_WEEK } from '@/lib/calendar-locale';
import { formatLongDay } from '@/lib/dates';
import { parisDay } from '@/lib/paris-time';
import { cn } from '@/lib/utils';
import { colors, fontFamily, fontSize, spacing } from '@/theme/tokens';
import { remToPx } from '@/theme/units';

export type HuntCalendarProps = {
  /**
   * Days that already have a hunt (`yyyy-MM-dd`): marked, and not selectable. With
   * `onSelectHunt`, pressing one calls it instead.
   */
  huntDates: string[];
  onSelectHunt?: (date: string) => void;
  selectedDate?: string;
  onSelectDate: (date: string) => void;
  /** Days before this one (`yyyy-MM-dd`) cannot be chosen. */
  minDate?: string;
};

// Header and day names: the library only accepts raw values, read from the tokens.
const DAY_WIDTH = remToPx(spacing['touch-min']); // same as the day cells (w-touch-min)
const CALENDAR_THEME = {
  calendarBackground: colors.card.DEFAULT,
  monthTextColor: colors.primary.DEFAULT,
  textMonthFontFamily: fontFamily['sans-bold'][0],
  textMonthFontSize: remToPx(fontSize.xl[0]),
  arrowColor: colors.primary.DEFAULT,
  // Replaces the library's whole `dayHeader` style, whose 32 px width on a single line cuts
  // the day names ("m…") in the readable font. Its margins are kept, as spacing tokens.
  'stylesheet.calendar.header': {
    dayHeader: {
      marginTop: remToPx(spacing['day-name-top']),
      marginBottom: remToPx(spacing['day-name-bottom']),
      width: DAY_WIDTH,
      textAlign: 'center',
      fontFamily: fontFamily['sans-bold'][0],
      fontSize: remToPx(fontSize.xs[0]),
      color: colors.muted.foreground,
    },
  },
};

/** A hunt calendar: French month view, today outlined, hunt days in light green. */
export function HuntCalendar({
  huntDates,
  selectedDate,
  onSelectDate,
  onSelectHunt,
  minDate,
}: HuntCalendarProps) {
  const markedDates: Record<string, { marked?: boolean; selected?: boolean }> = {};
  const huntDays = new Set(huntDates);
  for (const date of huntDates) {
    markedDates[date] = { marked: true };
  }
  if (selectedDate) {
    markedDates[selectedDate] = { ...markedDates[selectedDate], selected: true };
  }

  return (
    <Calendar
      testID="hunt-calendar"
      current={selectedDate}
      firstDay={FIRST_DAY_OF_WEEK}
      minDate={minDate}
      hideExtraDays
      markedDates={markedDates}
      onDayPress={(day: DateData) =>
        huntDays.has(day.dateString) ? onSelectHunt?.(day.dateString) : onSelectDate(day.dateString)
      }
      dayComponent={onSelectHunt ? OpenableHuntDayCell : DayCell}
      renderArrow={(direction: 'left' | 'right') => (
        <View className="h-touch-min w-touch-min items-center justify-center">
          <Icon as={direction === 'left' ? ChevronLeft : ChevronRight} className="text-primary" />
        </View>
      )}
      theme={CALENDAR_THEME}
    />
  );
}

type DayCellProps = React.ComponentProps<NonNullable<CalendarProps['dayComponent']>>;

/** A day cell whose hunt days can be pressed (to open the hunt). */
function OpenableHuntDayCell(props: DayCellProps) {
  return <DayCell {...props} huntOpenable />;
}

function DayCell({
  date,
  state,
  marking,
  onPress,
  huntOpenable = false,
}: DayCellProps & { huntOpenable?: boolean }) {
  if (!date) {
    return <View className="h-touch-min w-touch-min" />;
  }
  const isToday = date.dateString === parisDay(new Date());
  const isHunt = Boolean(marking?.marked);
  const isSelected = Boolean(marking?.selected) && !isHunt;
  const isDisabled = isHunt ? !huntOpenable : state === 'disabled';

  const label = [
    `${formatLongDay(date.dateString)} ${date.year}`,
    isToday && "aujourd'hui",
    isHunt && 'battue prévue',
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      role="button"
      aria-label={label}
      aria-selected={isSelected}
      aria-disabled={isDisabled}
      disabled={isDisabled}
      onPress={() => onPress?.(date)}
      className={cn(
        'h-touch-min w-touch-min items-center justify-center rounded-full',
        isToday && 'border-2 border-primary',
        isHunt && 'bg-accent-light',
        isSelected && 'bg-primary'
      )}>
      <Text
        className={cn(
          isToday && 'font-sans-bold',
          isHunt && 'text-foreground',
          isSelected && 'text-primary-foreground',
          !isHunt && !isSelected && state === 'disabled' && 'text-muted-foreground'
        )}>
        {date.day}
      </Text>
    </Pressable>
  );
}
