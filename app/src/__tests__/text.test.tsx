import { render, screen } from '@testing-library/react-native';

import { Text } from '@/components/ui/text';

// NativeWind does not compile classes under Jest: theme usage is checked on `className`.
describe('Text', () => {
  it('is set in Atkinson Hyperlegible by default', async () => {
    await render(<Text>Battue du samedi</Text>);

    expect(screen.getByText('Battue du samedi')).toHaveProp(
      'className',
      expect.stringContaining('font-sans')
    );
  });

  it.each([
    ['h1', 1],
    ['h2', 2],
    ['h3', 3],
    ['h4', 4],
  ] as const)('announces a %s as a heading of level %i', async (variant, level) => {
    await render(<Text variant={variant}>Battues à venir</Text>);

    expect(screen.getByRole('heading', { name: 'Battues à venir', level })).toBeOnTheScreen();
  });

  it('sets titles in the bold face and the primary color', async () => {
    await render(<Text variant="h1">Diane</Text>);

    const title = screen.getByRole('heading', { name: 'Diane' });
    expect(title).toHaveProp('className', expect.stringContaining('font-sans-bold'));
    expect(title).toHaveProp('className', expect.stringContaining('text-primary'));
  });
});
