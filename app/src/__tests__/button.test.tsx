import { render, screen, userEvent } from '@testing-library/react-native';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

describe('Button', () => {
  it('runs its action when pressed', async () => {
    const onPress = jest.fn();
    const user = userEvent.setup();
    await render(
      <Button onPress={onPress}>
        <Text>Créer une battue</Text>
      </Button>
    );

    await user.press(screen.getByRole('button', { name: 'Créer une battue' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('is announced as disabled and ignores presses when disabled', async () => {
    const onPress = jest.fn();
    const user = userEvent.setup();
    await render(
      <Button disabled onPress={onPress}>
        <Text>Envoyer les invitations</Text>
      </Button>
    );

    const button = screen.getByRole('button', { name: 'Envoyer les invitations' });
    await user.press(button);

    expect(button).toBeDisabled();
    expect(onPress).not.toHaveBeenCalled();
  });

  // NativeWind does not compile classes under Jest: theme usage is checked on `className`.
  it.each([
    [undefined, 'bg-primary', 'text-primary-foreground'],
    ['primary', 'bg-primary', 'text-primary-foreground'],
    ['secondary', 'bg-secondary', 'text-secondary-foreground'],
    ['danger', 'bg-danger', 'text-danger-foreground'],
  ] as const)('uses the theme colors of the %s variant', async (variant, background, text) => {
    await render(
      <Button variant={variant}>
        <Text>Annuler la battue</Text>
      </Button>
    );

    expect(screen.getByRole('button')).toHaveProp('className', expect.stringContaining(background));
    expect(screen.getByText('Annuler la battue')).toHaveProp(
      'className',
      expect.stringContaining(text)
    );
  });

  it('greys out a disabled button with the surface color', async () => {
    await render(
      <Button disabled>
        <Text>Envoyer</Text>
      </Button>
    );

    expect(screen.getByRole('button')).toHaveProp('className', expect.stringContaining('bg-muted'));
    expect(screen.getByText('Envoyer')).toHaveProp(
      'className',
      expect.stringContaining('text-muted-foreground')
    );
  });
});
