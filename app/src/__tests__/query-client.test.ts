import { queryClient } from '@/lib/query-client';

describe('query client', () => {
  it('retries a failed query only once, so an unreachable server is reported quickly', () => {
    expect(queryClient.getDefaultOptions().queries?.retry).toBe(1);
  });
});
