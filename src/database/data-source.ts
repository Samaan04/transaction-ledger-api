import 'dotenv/config';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../config/database.config';

// Used by the TypeORM CLI (npm run migration:run).
export default new DataSource(buildDataSourceOptions());
