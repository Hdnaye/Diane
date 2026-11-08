import { formatFrenchPhone, normalizeFrenchPhone } from '@/lib/phone';

describe('normalizeFrenchPhone', () => {
  it.each([
    ['06 39 98 00 01', '+33639980001'],
    ['0639980001', '+33639980001'],
    ['06.39.98.00.01', '+33639980001'],
    ['06-39-98-00-01', '+33639980001'],
    ['+33 6 39 98 00 01', '+33639980001'],
    ['+33 (0)6 39 98 00 01', '+33639980001'],
    ['0033 6 39 98 00 01', '+33639980001'],
    ['  06 39 98 00 02  ', '+33639980002'],
  ])('reads %s as %s, like the back-end', (input, expected) => {
    expect(normalizeFrenchPhone(input)).toBe(expected);
  });

  it.each(['06 39 98 00', '00 39 98 00 01', '+44 20 7946 0000', 'abc', ''])(
    'refuses %s',
    (input) => {
      expect(normalizeFrenchPhone(input)).toBeNull();
    }
  );
});

describe('formatFrenchPhone', () => {
  it('shows a stored number the way people write it', () => {
    expect(formatFrenchPhone('+33639980001')).toBe('06 39 98 00 01');
  });

  it('leaves anything else as is', () => {
    expect(formatFrenchPhone('+441234')).toBe('+441234');
  });
});
