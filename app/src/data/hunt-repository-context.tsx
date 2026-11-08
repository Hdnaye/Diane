import { createContext, useContext, type ReactNode } from 'react';

import type { HuntRepository } from '@/data/hunt-repository';
import { alwaysConnected, type ServerConnection } from '@/data/server-connection';

type DataSource = { repository: HuntRepository; connection: ServerConnection };

const DataSourceContext = createContext<DataSource | null>(null);

/**
 * Provides the data source: PocketBase in the app (`app-backend.ts`), a fresh in-memory
 * repository in tests. `connection` is the server connection made once at startup.
 */
export function HuntRepositoryProvider({
  repository,
  connection = alwaysConnected,
  children,
}: DataSource & { connection?: ServerConnection; children: ReactNode }) {
  return (
    <DataSourceContext.Provider value={{ repository, connection }}>
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
