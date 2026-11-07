import { cn } from '@/lib/utils';
import { Slot } from '@rn-primitives/slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { Platform, Text as RNText, type Role } from 'react-native';

const textVariants = cva(
  cn(
    'font-sans text-base text-foreground',
    Platform.select({
      web: 'select-text',
    })
  ),
  {
    variants: {
      variant: {
        default: '',
        h1: cn(
          'text-center font-sans-bold text-4xl text-primary',
          Platform.select({ web: 'scroll-m-20 text-balance' })
        ),
        h2: cn(
          'font-sans-bold text-3xl text-primary',
          Platform.select({ web: 'scroll-m-20 first:mt-0' })
        ),
        h3: cn('font-sans-bold text-2xl text-primary', Platform.select({ web: 'scroll-m-20' })),
        h4: cn('font-sans-bold text-xl text-primary', Platform.select({ web: 'scroll-m-20' })),
        p: 'mt-3 leading-7',
        lead: 'text-xl text-muted-foreground',
        large: 'font-sans-bold text-lg',
        small: 'text-sm leading-none',
        muted: 'text-sm text-muted-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

type TextVariantProps = VariantProps<typeof textVariants>;

type TextVariant = NonNullable<TextVariantProps['variant']>;

const ROLE: Partial<Record<TextVariant, Role>> = {
  h1: 'heading',
  h2: 'heading',
  h3: 'heading',
  h4: 'heading',
};

const ARIA_LEVEL: Partial<Record<TextVariant, string>> = {
  h1: '1',
  h2: '2',
  h3: '3',
  h4: '4',
};

const TextClassContext = React.createContext<string | undefined>(undefined);

function Text({
  className,
  asChild = false,
  variant = 'default',
  ...props
}: React.ComponentProps<typeof RNText> &
  React.RefAttributes<typeof RNText> &
  TextVariantProps & {
    asChild?: boolean;
  }) {
  const textClass = React.useContext(TextClassContext);
  const Component = asChild ? Slot : RNText;
  return (
    <Component
      className={cn(textVariants({ variant }), textClass, className)}
      role={variant ? ROLE[variant] : undefined}
      aria-level={variant ? ARIA_LEVEL[variant] : undefined}
      {...props}
    />
  );
}

export { Text, TextClassContext };
