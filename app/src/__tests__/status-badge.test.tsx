import { render, screen } from '@testing-library/react-native';

import { StatusBadge } from '@/components/status-badge';

// A status is never conveyed by color alone: each badge shows an icon and a label.
describe('StatusBadge', () => {
  it.each([
    ['present', 'Présent'],
    ['absent', 'Absent'],
    ['waiting_list', "Liste d'attente"],
    ['no_answer', 'Sans réponse'],
  ] as const)('shows the "%s" status as an icon and the label "%s"', async (status, label) => {
    await render(<StatusBadge status={status} />);

    expect(screen.getByText(label)).toBeOnTheScreen();
    // The icon is decorative (hidden from screen readers): the label carries the meaning.
    expect(
      screen.getByTestId('status-badge-icon', { includeHiddenElements: true })
    ).toBeOnTheScreen();
  });

  // NativeWind does not compile classes under Jest: theme usage is checked on `className`.
  it.each([
    ['present', 'Présent', 'bg-accent-light', 'text-foreground'],
    ['absent', 'Absent', 'bg-danger', 'text-danger-foreground'],
    ['waiting_list', "Liste d'attente", 'bg-warning', 'text-warning-foreground'],
    ['no_answer', 'Sans réponse', 'bg-surface', 'text-surface-foreground'],
  ] as const)(
    'uses the theme colors of the "%s" status',
    async (status, label, background, text) => {
      await render(<StatusBadge status={status} testID="badge" />);

      expect(screen.getByTestId('badge')).toHaveProp(
        'className',
        expect.stringContaining(background)
      );
      expect(screen.getByText(label)).toHaveProp('className', expect.stringContaining(text));
    }
  );
});
