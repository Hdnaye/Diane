import { render, screen, userEvent } from '@testing-library/react-native';

import { StepperField } from '@/components/stepper-field';

describe('StepperField', () => {
  it('shows its label and value, and runs the step pressed', async () => {
    const earlier = jest.fn();
    const later = jest.fn();
    const user = userEvent.setup();
    await render(
      <StepperField
        label="Heure de rendez-vous"
        value="8 h 00"
        steps={[
          [
            { text: '− 1 h', label: 'rendez-vous une heure plus tôt', onPress: earlier },
            { text: '+ 1 h', label: 'rendez-vous une heure plus tard', onPress: later },
          ],
        ]}
      />
    );

    expect(screen.getByText('Heure de rendez-vous')).toBeOnTheScreen();
    expect(screen.getByText('8 h 00')).toBeOnTheScreen();

    // WCAG 2.5.3 "Label in Name": the spoken name starts with the visible text, so voice
    // control users can say what they see.
    await user.press(screen.getByRole('button', { name: '− 1 h, rendez-vous une heure plus tôt' }));
    expect(earlier).toHaveBeenCalledTimes(1);
    await user.press(
      screen.getByRole('button', { name: '+ 1 h, rendez-vous une heure plus tard' })
    );
    expect(later).toHaveBeenCalledTimes(1);
  });
});
