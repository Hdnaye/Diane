import { render, screen } from '@testing-library/react-native';

import HomeScreen from '@/app/index';

describe('HomeScreen', () => {
  it('shows the app name and a button to create a hunt', async () => {
    await render(<HomeScreen />);

    expect(screen.getByText('Diane')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Créer une battue' })).toBeOnTheScreen();
  });
});
