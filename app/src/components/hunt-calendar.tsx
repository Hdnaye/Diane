export type HuntCalendarProps = {
  /** Days that already have a hunt (`yyyy-MM-dd`): marked and not selectable. */
  huntDates: string[];
  selectedDate?: string;
  onSelectDate: (date: string) => void;
  /** Days before this one (`yyyy-MM-dd`) cannot be chosen. */
  minDate?: string;
};

export function HuntCalendar(_props: HuntCalendarProps) {
  return null;
}
