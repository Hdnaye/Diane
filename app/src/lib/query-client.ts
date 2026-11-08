import { QueryClient } from '@tanstack/react-query';

// A single retry: when the server cannot be reached, the error shows in about 2 s instead of
// about 15 s with TanStack Query's default 3 retries.
export const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1 } } });
