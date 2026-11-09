import { Text } from '@/components/ui/text';

/** An error under a field, announced by screen readers. */
export function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }
  return (
    <Text role="alert" className="font-sans-bold text-danger">
      {message}
    </Text>
  );
}
