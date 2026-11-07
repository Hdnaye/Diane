import { render, screen, userEvent } from '@testing-library/react-native';

import { HuntCalendar } from '@/components/hunt-calendar';
import { freezeDate, unfreezeDate } from '@/test-utils/clock';

// Saturday 7 November 2026, 10:00.
const TODAY = new Date(2026, 10, 7, 10, 0);

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

  it('marks today so it can be spotted', async () => {
    await render(<HuntCalendar huntDates={[]} onSelectDate={jest.fn()} />);

    const today = screen.getByRole('button', { name: "samedi 7 novembre 2026, aujourd'hui" });
    expect(today).toHaveProp('className', expect.stringContaining('border-primary'));
  });

  it('marks hunt days in light green with readable text and does not let them be chosen', async () => {
    const onSelectDate = jest.fn();
    const user = userEvent.setup();
    await render(<HuntCalendar huntDates={['2026-11-14']} onSelectDate={onSelectDate} />);

    const huntDay = screen.getByRole('button', { name: 'samedi 14 novembre 2026, battue prévue' });
    expect(huntDay).toBeDisabled();
    expect(huntDay).toHaveProp('className', expect.stringContaining('bg-accent-light'));
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
    expect(selected).toHaveProp('className', expect.stringContaining('bg-primary'));
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
