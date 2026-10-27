import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';

export interface TestContext {
  app: INestApplication;
  ds: DataSource;
  http: () => ReturnType<typeof request>;
  reset: () => Promise<void>;
  close: () => Promise<void>;
  createAccount: (name?: string) => Promise<string>;
  tx: (accountId: string, body: Record<string, unknown>) => request.Test;
  balance: (accountId: string) => Promise<string>;
}

export async function createTestApp(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init(); // runs migrations (migrationsRun: true)
  const ds = app.get(DataSource);
  const http = () => request(app.getHttpServer());

  return {
    app,
    ds,
    http,
    reset: async () => {
      await ds.query('TRUNCATE TABLE transactions, accounts');
    },
    close: () => app.close(),
    createAccount: async (name = 'Test User') => (await http().post('/accounts').send({ name })).body.id,
    tx: (accountId, body) => http().post(`/accounts/${accountId}/transactions`).send(body),
    balance: async (accountId) => (await http().get(`/accounts/${accountId}/balance`)).body.balance,
  };
}
