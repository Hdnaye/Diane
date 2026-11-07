import { TextClassContext } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { Slot } from '@rn-primitives/slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Platform, View } from 'react-native';

const badgeVariants = cva(
  cn(
    'group shrink-0 flex-row items-center justify-center gap-1.5 self-start overflow-hidden rounded-full px-3 py-1',
    Platform.select({
      web: 'w-fit whitespace-nowrap [&>svg]:pointer-events-none',
    })
  ),
  {
    variants: {
      variant: {
        primary: 'bg-primary',
        secondary: 'bg-secondary',
        success: 'bg-accent-light',
        danger: 'bg-danger',
        warning: 'bg-warning',
        neutral: 'bg-surface',
      },
    },
    defaultVariants: {
      variant: 'primary',
    },
  }
);

const badgeTextVariants = cva('font-sans-bold text-sm', {
  variants: {
    variant: {
      primary: 'text-primary-foreground',
      secondary: 'text-secondary-foreground',
      success: 'text-foreground',
      danger: 'text-danger-foreground',
      warning: 'text-warning-foreground',
      neutral: 'text-surface-foreground',
    },
  },
  defaultVariants: {
    variant: 'primary',
  },
});

type BadgeProps = React.ComponentProps<typeof View> &
  React.RefAttributes<View> & {
    asChild?: boolean;
  } & VariantProps<typeof badgeVariants>;

function Badge({ className, variant, asChild, ...props }: BadgeProps) {
  const Component = asChild ? Slot : View;
  return (
    <TextClassContext.Provider value={badgeTextVariants({ variant })}>
      <Component className={cn(badgeVariants({ variant }), className)} {...props} />
    </TextClassContext.Provider>
  );
}

export { Badge, badgeTextVariants, badgeVariants };
export type { BadgeProps };
