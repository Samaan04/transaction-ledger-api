import { TransactionsService } from '../src/transactions/transactions.service';
import { createTestApp, TestContext } from './setup/test-app';

describe('Data integrity', () => {
  let t: TestContext;
  beforeAll(async () => (t = await createTestApp()));
  afterAll(() => t.close());
  beforeEach(() => t.reset());
  afterEach(() => jest.restoreAllMocks());

  const ledgerCount = async (id: string) =>
    (await t.ds.query('SELECT count(*)::int AS c FROM transactions WHERE account_id=$1', [id]))[0].c;

  describe('atomicity', () => {
    it('rolls back the balance update if the transaction insert fails', async () => {
      const id = await t.createAccount();
      await t.tx(id, { type: 'credit', amount: 100, reference_id: 'seed' }).expect(201);

      // The balance UPDATE runs first; make the INSERT blow up afterwards.
      jest.spyOn(TransactionsService.prototype as any, 'insertEntry').mockRejectedValue(new Error('disk full'));
      const res = await t.tx(id, { type: 'credit', amount: 50, reference_id: 'boom' }).expect(500);
      expect(res.body.error).toBe('INTERNAL_ERROR');
      jest.restoreAllMocks();

      expect(await t.balance(id)).toBe('100.00');
      expect(await ledgerCount(id)).toBe(1);
    });

    it('rolls back a debit too when the insert fails', async () => {
      const id = await t.createAccount();
      await t.tx(id, { type: 'credit', amount: 100, reference_id: 'seed' }).expect(201);
      jest.spyOn(TransactionsService.prototype as any, 'insertEntry').mockRejectedValue(new Error('boom'));
      await t.tx(id, { type: 'debit', amount: 40, reference_id: 'boom' }).expect(500);
      jest.restoreAllMocks();
      expect(await t.balance(id)).toBe('100.00');
    });
  });

  describe('concurrency', () => {
    it('concurrent debits never overdraw: 10 x 30 against balance 100 => exactly 3 succeed', async () => {
      const id = await t.createAccount();
      await t.tx(id, { type: 'credit', amount: 100, reference_id: 'seed' }).expect(201);

      const results = await Promise.all(
        Array.from({ length: 10 }, (_, i) => t.tx(id, { type: 'debit', amount: 30, reference_id: `d-${i}` })),
      );
      const statuses = results.map((r) => r.status);
      expect(statuses.filter((s) => s === 201)).toHaveLength(3);
      expect(statuses.filter((s) => s === 422)).toHaveLength(7);
      expect(await t.balance(id)).toBe('10.00');
      expect(await ledgerCount(id)).toBe(4);
    });

    it('concurrent identical reference_id: one 201, the rest 409, balance changed once', async () => {
      const id = await t.createAccount();
      const results = await Promise.all(
        Array.from({ length: 10 }, () => t.tx(id, { type: 'credit', amount: 25, reference_id: 'same' })),
      );
      const statuses = results.map((r) => r.status);
      expect(statuses.filter((s) => s === 201)).toHaveLength(1);
      expect(statuses.filter((s) => s === 409)).toHaveLength(9);
      expect(await t.balance(id)).toBe('25.00');
      expect(await ledgerCount(id)).toBe(1);
    });

    it('mixed concurrent credits and debits keep balance == sum of ledger', async () => {
      const id = await t.createAccount();
      await t.tx(id, { type: 'credit', amount: 500, reference_id: 'seed' }).expect(201);
      await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          t.tx(id, { type: i % 2 ? 'debit' : 'credit', amount: 7.5, reference_id: `m-${i}` }),
        ),
      );
      const [{ sum }] = await t.ds.query(
        `SELECT COALESCE(SUM(CASE type WHEN 'credit' THEN amount ELSE -amount END),0)::text AS sum
           FROM transactions WHERE account_id=$1`,
        [id],
      );
      expect(Number(await t.balance(id))).toBe(Number(sum));
      expect(Number(sum)).toBe(500);
    });
  });

  describe('immutability', () => {
    it.each(['put', 'patch', 'delete'] as const)('exposes no %s route for transactions', async (verb) => {
      const id = await t.createAccount();
      const created = await t.tx(id, { type: 'credit', amount: 10, reference_id: 'r' }).expect(201);
      const res = await t.http()[verb](`/accounts/${id}/transactions/${created.body.id}`).send({ amount: 1 });
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('NOT_FOUND');
    });

    it('database rejects UPDATE and DELETE on transactions', async () => {
      const id = await t.createAccount();
      const created = await t.tx(id, { type: 'credit', amount: 10, reference_id: 'r' }).expect(201);
      await expect(t.ds.query('UPDATE transactions SET amount = 999 WHERE id=$1', [created.body.id])).rejects.toThrow(/immutable/);
      await expect(t.ds.query('DELETE FROM transactions WHERE id=$1', [created.body.id])).rejects.toThrow(/immutable/);
      const [row] = await t.ds.query('SELECT amount::text FROM transactions WHERE id=$1', [created.body.id]);
      expect(row.amount).toBe('10.00');
    });
  });

  describe('database constraints', () => {
    it('refuses a negative balance', async () => {
      const id = await t.createAccount();
      await expect(t.ds.query('UPDATE accounts SET balance = -1 WHERE id=$1', [id])).rejects.toMatchObject({ code: '23514' });
    });

    it('refuses non-positive amounts and invalid types', async () => {
      const id = await t.createAccount();
      await expect(
        t.ds.query(`INSERT INTO transactions (account_id,type,amount,reference_id) VALUES ($1,'credit',0,'z')`, [id]),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        t.ds.query(`INSERT INTO transactions (account_id,type,amount,reference_id) VALUES ($1,'refund',1,'z')`, [id]),
      ).rejects.toMatchObject({ code: '23514' });
    });

    it('refuses transactions for a missing account (FK)', async () => {
      await expect(
        t.ds.query(
          `INSERT INTO transactions (account_id,type,amount,reference_id) VALUES ('11111111-1111-4111-8111-111111111111','credit',1,'z')`,
        ),
      ).rejects.toMatchObject({ code: '23503' });
    });
  });
});
