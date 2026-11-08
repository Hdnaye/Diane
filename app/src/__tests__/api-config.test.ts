import { readApiConfig } from '@/lib/api-config';

const env = {
  url: 'http://192.168.1.20:8090',
  organizerEmail: 'organizer@example.com',
  organizerKey: 'fake-key-for-tests',
};

describe('API configuration', () => {
  it('reads the server address and the organizer credentials', () => {
    expect(readApiConfig(env)).toEqual(env);
  });

  it('ignores surrounding spaces and a trailing slash in the address', () => {
    expect(readApiConfig({ ...env, url: ' http://192.168.1.20:8090/ ' })).toEqual(env);
  });

  it.each(['url', 'organizerEmail', 'organizerKey'] as const)(
    'is missing when %s is not set',
    (name) => {
      expect(readApiConfig({ ...env, [name]: undefined })).toBeNull();
      expect(readApiConfig({ ...env, [name]: '  ' })).toBeNull();
    }
  );
});
