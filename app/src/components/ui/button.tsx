import { TextClassContext } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';
import { Platform, Pressable } from 'react-native';

const buttonVariants = cva(
  cn(
    'group shrink-0 flex-row items-center justify-center gap-2 rounded-lg',
    Platform.select({
      web: 'whitespace-nowrap outline-none transition-all focus-visible:ring-4 focus-visible:ring-ring disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0',
    })
  ),
  {
    variants: {
      variant: {
        primary: cn(
          'bg-primary active:bg-primary/90',
          Platform.select({ web: 'hover:bg-primary/90' })
        ),
        secondary: cn(
          'bg-secondary active:bg-secondary/80',
          Platform.select({ web: 'hover:bg-secondary/80' })
        ),
        danger: cn('bg-danger active:bg-danger/90', Platform.select({ web: 'hover:bg-danger/90' })),
      },
      size: {
        default: 'min-h-touch px-6 py-2',
        sm: 'min-h-touch-min gap-1.5 px-4 py-1',
        lg: 'min-h-touch-lg px-8 py-2',
        icon: 'h-touch w-touch',
      },
      disabled: {
        true: 'bg-muted',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
      disabled: false,
    },
  }
);

const buttonTextVariants = cva(
  cn('shrink text-center font-sans-bold text-base', Platform.select({ web: 'pointer-events-none transition-colors' })),
  {
    variants: {
      variant: {
        primary: 'text-primary-foreground',
        secondary: 'text-secondary-foreground',
        danger: 'text-danger-foreground',
      },
      size: {
        default: '',
        sm: '',
        lg: 'text-lg',
        icon: '',
      },
      disabled: {
        true: 'text-muted-foreground',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
      disabled: false,
    },
  }
);

type ButtonProps = React.ComponentProps<typeof Pressable> &
  React.RefAttributes<typeof Pressable> &
  Omit<VariantProps<typeof buttonVariants>, 'disabled'>;

function Button({ className, variant, size, ...props }: ButtonProps) {
  // Disabled buttons use the surface color instead of transparency, which would lower contrast.
  const disabled = Boolean(props.disabled);
  return (
    <TextClassContext.Provider value={buttonTextVariants({ variant, size, disabled })}>
      <Pressable
        className={cn(buttonVariants({ variant, size, disabled }), className)}
        role="button"
        {...props}
      />
    </TextClassContext.Provider>
  );
}

export { Button, buttonTextVariants, buttonVariants };
export type { ButtonProps };
