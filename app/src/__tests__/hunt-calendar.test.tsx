import { render, screen, userEvent } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { HuntCalendar } from '@/components/hunt-calendar';
import { freezeDate, unfreezeDate } from '@/test-utils/clock';
import { colors, fontFamily, spacing } from '@/theme/tokens';
import { remToPx } from '@/theme/units';

// Saturday 7 November 2026, 10:00.
const TODAY = new Date(2026, 10, 7, 10, 0);

type ReactTestInstanceLike = ReturnType<typeof screen.getByRole>;

/** The closest parent of an element with a vertical margin: the row of its week. */
function findWithStyle(element: ReactTestInstanceLike): ReactTestInstanceLike {
  let current = element.parent;
  while (current && StyleSheet.flatten(current.props.style)?.marginVertical === undefined) {
    current = current.parent;
  }
  if (!current) throw new Error('No parent with a vertical margin');
  return current;
}

describe('HuntCalendar', () => {
  beforeEach(() => freezeDate(TODAY));
  afterEach(unfreezeDate);

  it('shows the current month in French, weeks starting on Monday', async () => {
    await render(<HuntCalendar huntDates={[]} onSelectDate={jest.fn()} />);

    // The library hides the header's texts from screen readers (the header is an "adjustable"
    // element changing the month), and each day has a full label: query hidden elements.
    expect(screen.getByText('novembre 2026', { includeHiddenElements: true })).toBeOnTheScreen();
    const dayNames = screen.getAllByText(/^(lun|mar|mer|jeu|ven|sam|dim)\.$/, {
      includeHiddenElements: true,
    });
    expect(dayNames.map((name) => name.props.children)).toEqual([
      'lun.',
      'mar.',
      'mer.',
      'jeu.',
      'ven.',
      'sam.',
      'dim.',
    ]);
  });

  it('shares the width of the screen between the day names, so none overflows or is cut', async () => {
    await render(<HuntCalendar huntDates={[]} onSelectDate={jest.fn()} />);

    // The library sets 32 px on one line, too narrow for the bold readable font; a fixed width
    // would overflow on a narrow phone.
    for (const name of screen.getAllByText(/^(lun|mar|mer|jeu|ven|sam|dim)\.$/, {
      includeHiddenElements: true,
    })) {
      expect(name).toHaveStyle({ flex: 1 });
      expect(name).not.toHaveStyle({ width: expect.anything() });
      expect(name).toHaveStyle({ fontFamily: fontFamily['sans-bold'][0] });
      expect(name).toHaveStyle({ color: colors.muted.foreground });
    }
  });

  it('shares the width of the screen between the days, with their full touch height', async () => {
    await render(<HuntCalendar huntDates={[]} onSelectDate={jest.fn()} />);

    const day = screen.getByRole('button', { name: /^dimanche 15 novembre/ });

    expect(day).toHaveProp('className', expect.stringContaining('w-full'));
    expect(day).toHaveProp('className', expect.stringContaining('h-touch-min'));
    expect(day).toHaveProp('className', expect.not.stringContaining('w-touch-min'));
  });

  it('takes little height: no margin around the month, weeks almost touching', async () => {
    await render(<HuntCalendar huntDates={[]} onSelectDate={jest.fn()} />);

    expect(screen.getByText('novembre 2026', { includeHiddenElements: true })).toHaveStyle({
      margin: 0,
    });
    const week = findWithStyle(screen.getByRole('button', { name: /^dimanche 15 novembre/ }));
    expect(week).toHaveStyle({ marginVertical: remToPx(spacing['calendar-week-gap']) });
    expect(remToPx(spacing['calendar-week-gap'])).toBeLessThan(7);
  });

  it("keeps the space around the day names (the library's margins, from the spacing tokens)", async () => {
    await render(<HuntCalendar huntDates={[]} onSelectDate={jest.fn()} />);

    // The library's own style has 2 px above and 7 px below, lost when replacing `dayHeader`.
    for (const name of screen.getAllByText(/^(lun|mar|mer|jeu|ven|sam|dim)\.$/, {
      includeHiddenElements: true,
    })) {
      expect(name).toHaveStyle({ marginTop: remToPx(spacing['day-name-top']) });
      expect(name).toHaveStyle({ marginBottom: remToPx(spacing['day-name-bottom']) });
    }
  });

  it('marks today so it can be spotted', async () => {
    await render(<HuntCalendar huntDates={[]} onSelectDate={jest.fn()} />);

    const today = screen.getByRole('button', { name: "samedi 7 novembre 2026, aujourd'hui" });
    expect(today).toBeOnTheScreen();
    expect(screen.getByTestId('day-mark-2026-11-07')).toHaveProp(
      'className',
      expect.stringContaining('border-primary')
    );
  });

  it('marks hunt days in light green with readable text and does not let them be chosen', async () => {
    const onSelectDate = jest.fn();
    const user = userEvent.setup();
    await render(<HuntCalendar huntDates={['2026-11-14']} onSelectDate={onSelectDate} />);

    const huntDay = screen.getByRole('button', { name: 'samedi 14 novembre 2026, battue prévue' });
    expect(huntDay).toBeDisabled();
    expect(screen.getByTestId('day-mark-2026-11-14')).toHaveProp(
      'className',
      expect.stringContaining('bg-accent-light')
    );
    expect(screen.getByText('14')).toHaveProp(
      'className',
      expect.stringContaining('text-foreground')
    );

    await user.press(huntDay);
    expect(onSelectDate).not.toHaveBeenCalled();
  });

  it('lets a free day be chosen and shows it as selected', async () => {
    const onSelectDate = jest.fn();
    const user = userEvent.setup();
    const { rerender } = await render(<HuntCalendar huntDates={[]} onSelectDate={onSelectDate} />);

    await user.press(screen.getByRole('button', { name: 'vendredi 20 novembre 2026' }));
    expect(onSelectDate).toHaveBeenCalledWith('2026-11-20');

    await rerender(
      <HuntCalendar huntDates={[]} selectedDate="2026-11-20" onSelectDate={onSelectDate} />
    );
    const selected = screen.getByRole('button', { name: 'vendredi 20 novembre 2026' });
    expect(selected).toBeSelected();
    expect(screen.getByTestId('day-mark-2026-11-20')).toHaveProp(
      'className',
      expect.stringContaining('bg-primary')
    );
    expect(screen.getByText('20')).toHaveProp(
      'className',
      expect.stringContaining('text-primary-foreground')
    );
  });

  it('does not let a past day be chosen when a minimum day is given', async () => {
    await render(<HuntCalendar huntDates={[]} minDate="2026-11-07" onSelectDate={jest.fn()} />);

    expect(screen.getByRole('button', { name: 'vendredi 6 novembre 2026' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'lundi 9 novembre 2026' })).toBeEnabled();
  });
});
