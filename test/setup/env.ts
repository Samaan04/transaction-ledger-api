import 'dotenv/config';

// Tests always run against a dedicated database, never the dev one.
process.env.DB_NAME = process.env.TEST_DB_NAME ?? 'ledger_test';
import { EventEmitter } from 'events';

// Each suite boots its own Nest app in one process.
EventEmitter.defaultMaxListeners = 50;
