import { join } from 'path';
import { DataSourceOptions } from 'typeorm';

export function buildDataSourceOptions(): DataSourceOptions {
  return {
    type: 'postgres',
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5433),
    username: process.env.DB_USER ?? 'ledger',
    password: process.env.DB_PASSWORD ?? 'ledger',
    database: process.env.DB_NAME ?? 'ledger',
    entities: [join(__dirname, '..', '**', '*.entity.{ts,js}')],
    migrations: [join(__dirname, '..', 'database', 'migrations', '*.{ts,js}')],
    // Schema is owned by migrations, never by synchronize.
    synchronize: false,
    extra: { max: Number(process.env.DB_POOL_SIZE ?? 20) },
  };
}
