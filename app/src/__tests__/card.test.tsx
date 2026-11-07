import { render, screen } from '@testing-library/react-native';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Text } from '@/components/ui/text';

function HuntCard() {
  return (
    <Card testID="card">
      <CardHeader>
        <CardTitle>Samedi 14 novembre</CardTitle>
        <CardDescription>Rendez-vous à 8 h</CardDescription>
      </CardHeader>
      <CardContent>
        <Text>12 participants</Text>
      </CardContent>
    </Card>
  );
}

describe('Card', () => {
  it('shows its title as a heading, then its description and content', async () => {
    await render(<HuntCard />);

    expect(screen.getByRole('heading', { name: 'Samedi 14 novembre' })).toBeOnTheScreen();
    expect(screen.getByText('Rendez-vous à 8 h')).toBeOnTheScreen();
    expect(screen.getByText('12 participants')).toBeOnTheScreen();
  });

  // NativeWind does not compile classes under Jest: theme usage is checked on `className`.
  it('is a rounded card with a light border and a bold primary title', async () => {
    await render(<HuntCard />);

    const card = screen.getByTestId('card');
    expect(card).toHaveProp('className', expect.stringContaining('rounded-xl'));
    expect(card).toHaveProp('className', expect.stringContaining('border-border'));
    expect(card).toHaveProp('className', expect.not.stringContaining('shadow'));
    const title = screen.getByRole('heading', { name: 'Samedi 14 novembre' });
    expect(title).toHaveProp('className', expect.stringContaining('font-sans-bold'));
    expect(title).toHaveProp('className', expect.stringContaining('text-primary'));
  });
});
