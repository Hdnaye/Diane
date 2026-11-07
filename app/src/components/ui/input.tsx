import { cn } from '@/lib/utils';
import { Platform, TextInput } from 'react-native';

// Adapted to the readable theme: tall field, large text, field border at 3:1, no transparency.
function Input({
  className,
  ...props
}: React.ComponentProps<typeof TextInput> & React.RefAttributes<TextInput>) {
  return (
    <TextInput
      className={cn(
        'flex h-touch w-full min-w-0 flex-row items-center rounded-lg border border-input bg-card px-4 font-sans text-base text-foreground',
        props.editable === false &&
          cn(
            'bg-muted text-muted-foreground',
            Platform.select({ web: 'disabled:pointer-events-none disabled:cursor-not-allowed' })
          ),
        Platform.select({
          web: cn(
            'outline-none transition-colors selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground',
            'focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring',
            'aria-invalid:border-danger'
          ),
          native: 'placeholder:text-muted-foreground',
        }),
        className
      )}
      {...props}
    />
  );
}

export { Input };
