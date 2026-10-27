import { createTestApp, TestContext } from './setup/test-app';

describe('Transactions', () => {
  let t: TestContext;
  beforeAll(async () => (t = await createTestApp()));
  afterAll(() => t.close());
  beforeEach(() => t.reset());

  const count = async () => (await t.ds.query('SELECT count(*)::int AS c FROM transactions'))[0].c;

  it('credit increases and debit decreases the balance', async () => {
    const id = await t.createAccount();
    const credit = await t.tx(id, { type: 'credit', amount: 100, reference_id: 'r1', description: 'top up' }).expect(201);
    expect(credit.body).toMatchObject({
      account_id: id, type: 'credit', amount: '100.00', description: 'top up', reference_id: 'r1', balance_after: '100.00',
    });
    expect(credit.body.id).toBeDefined();
    expect(credit.body.created_at).toBeDefined();

    await t.tx(id, { type: 'credit', amount: '50', reference_id: 'r2' }).expect(201);
    const debit = await t.tx(id, { type: 'debit', amount: 30, reference_id: 'r3' }).expect(201);
    expect(debit.body.balance_after).toBe('120.00');
    expect(await t.balance(id)).toBe('120.00');
  });

  it('balance example from the brief: 100,50 credits and 30,20 debits => 100', async () => {
    const id = await t.createAccount();
    for (const [i, [type, amount]] of [['credit', 100], ['credit', 50], ['debit', 30], ['debit', 20]].entries()) {
      await t.tx(id, { type, amount, reference_id: `ref-${i}` }).expect(201);
    }
    expect(await t.balance(id)).toBe('100.00');
  });

  it('keeps exact decimals (no float drift)', async () => {
    const id = await t.createAccount();
    await t.tx(id, { type: 'credit', amount: 0.1, reference_id: 'a' }).expect(201);
    await t.tx(id, { type: 'credit', amount: 0.2, reference_id: 'b' }).expect(201);
    expect(await t.balance(id)).toBe('0.30');
  });

  describe('insufficient balance', () => {
    it('rejects with 422 and leaves balance and ledger untouched', async () => {
      const id = await t.createAccount();
      await t.tx(id, { type: 'credit', amount: 100, reference_id: 'c' }).expect(201);
      const res = await t.tx(id, { type: 'debit', amount: 150, reference_id: 'd' }).expect(422);
      expect(res.body).toMatchObject({ statusCode: 422, error: 'INSUFFICIENT_BALANCE' });
      expect(await t.balance(id)).toBe('100.00');
      expect(await count()).toBe(1);
    });

    it('allows debiting the exact balance (down to 0)', async () => {
      const id = await t.createAccount();
      await t.tx(id, { type: 'credit', amount: 100, reference_id: 'c' }).expect(201);
      await t.tx(id, { type: 'debit', amount: 100, reference_id: 'd' }).expect(201);
      expect(await t.balance(id)).toBe('0.00');
    });

    it('a rejected debit does not consume its reference_id', async () => {
      const id = await t.createAccount();
      await t.tx(id, { type: 'debit', amount: 10, reference_id: 'retry' }).expect(422);
      await t.tx(id, { type: 'credit', amount: 10, reference_id: 'retry' }).expect(201);
    });
  });

  describe('duplicate reference_id', () => {
    it('returns 409, creates nothing, does not change balance, exposes the original', async () => {
      const id = await t.createAccount();
      const first = await t.tx(id, { type: 'credit', amount: 100, reference_id: 'dup' }).expect(201);
      const res = await t.tx(id, { type: 'credit', amount: 100, reference_id: 'dup' }).expect(409);
      expect(res.body).toMatchObject({ statusCode: 409, error: 'DUPLICATE_TRANSACTION' });
      expect(res.body.details.transaction.id).toBe(first.body.id);
      expect(await t.balance(id)).toBe('100.00');
      expect(await count()).toBe(1);
    });

    it('is 409 even when type/amount differ (reference is the identity)', async () => {
      const id = await t.createAccount();
      await t.tx(id, { type: 'credit', amount: 100, reference_id: 'dup' }).expect(201);
      await t.tx(id, { type: 'debit', amount: 5, reference_id: 'dup' }).expect(409);
      expect(await t.balance(id)).toBe('100.00');
    });

    it('allows the same reference_id on different accounts', async () => {
      const a = await t.createAccount('A');
      const b = await t.createAccount('B');
      await t.tx(a, { type: 'credit', amount: 10, reference_id: 'shared' }).expect(201);
      await t.tx(b, { type: 'credit', amount: 20, reference_id: 'shared' }).expect(201);
      expect(await t.balance(a)).toBe('10.00');
      expect(await t.balance(b)).toBe('20.00');
    });

    it('the database itself enforces UNIQUE(account_id, reference_id)', async () => {
      const id = await t.createAccount();
      await t.tx(id, { type: 'credit', amount: 1, reference_id: 'x' }).expect(201);
      await expect(
        t.ds.query(`INSERT INTO transactions (account_id, type, amount, reference_id) VALUES ($1,'credit',1,'x')`, [id]),
      ).rejects.toMatchObject({ code: '23505' });
    });
  });

  describe('validation', () => {
    const valid = { type: 'credit', amount: 10, reference_id: 'v' };

    it.each([
      ['invalid type', { ...valid, type: 'refund' }],
      ['uppercase type', { ...valid, type: 'CREDIT' }],
      ['missing type', { amount: 10, reference_id: 'v' }],
      ['zero amount', { ...valid, amount: 0 }],
      ['zero string amount', { ...valid, amount: '0.00' }],
      ['negative amount', { ...valid, amount: -5 }],
      ['non-numeric amount', { ...valid, amount: 'abc' }],
      ['3 decimal places', { ...valid, amount: '1.234' }],
      ['missing amount', { type: 'credit', reference_id: 'v' }],
      ['null amount', { ...valid, amount: null }],
      ['missing reference_id', { type: 'credit', amount: 10 }],
      ['blank reference_id', { ...valid, reference_id: '  ' }],
      ['unknown field', { ...valid, balance: 5 }],
      ['description too long', { ...valid, description: 'x'.repeat(501) }],
    ])('400 for %s', async (_name, body) => {
      const id = await t.createAccount();
      const res = await t.tx(id, body as any).expect(400);
      expect(res.body).toMatchObject({ statusCode: 400, error: 'VALIDATION_ERROR' });
      expect(await count()).toBe(0);
    });

    it('404 for unknown account', async () => {
      const res = await t.tx('11111111-1111-4111-8111-111111111111', valid).expect(404);
      expect(res.body.error).toBe('ACCOUNT_NOT_FOUND');
    });

    it('400 for malformed account id', async () => {
      const res = await t.tx('nope', valid).expect(400);
      expect(res.body.error).toBe('INVALID_ACCOUNT_ID');
    });
  });
});
