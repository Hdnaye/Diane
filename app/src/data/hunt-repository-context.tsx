import { createContext, useContext, type ReactNode } from 'react';

import type { HuntFollowUpRepository } from '@/data/hunt-follow-up';
import type { HuntRepository } from '@/data/hunt-repository';
import { alwaysConnected, type ServerConnection } from '@/data/server-connection';

type DataSource = {
  repository: HuntRepository;
  connection: ServerConnection;
  followUp: HuntFollowUpRepository;
};

const DataSourceContext = createContext<DataSource | null>(null);

/**
 * Provides the data source: PocketBase in the app (`app-backend.ts`), a fresh in-memory
 * repository in tests. `connection` is the server connection made once at startup, `followUp`
 * the follow-up of hunts (invitations, answers, SMS to check).
 */
export function HuntRepositoryProvider({
  repository,
  connection = alwaysConnected,
  followUp,
  children,
}: DataSource & { connection?: ServerConnection; children: ReactNode }) {
  return (
    <DataSourceContext.Provider value={{ repository, connection, followUp }}>
      {children}
    </DataSourceContext.Provider>
  );
}

function useDataSource(): DataSource {
  const dataSource = useContext(DataSourceContext);
  if (!dataSource) {
    throw new Error('Data hooks must be used inside a HuntRepositoryProvider');
  }
  return dataSource;
}

export function useHuntRepository(): HuntRepository {
  return useDataSource().repository;
}

export function useServerConnectionSource(): ServerConnection {
  return useDataSource().connection;
}

export function useHuntFollowUpRepository(): HuntFollowUpRepository {
  return useDataSource().followUp;
}
