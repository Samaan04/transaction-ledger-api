import { TransactionsService } from '../src/transactions/transactions.service';
import { createTestApp, TestContext } from './setup/test-app';

describe('Transfers (bonus)', () => {
  let t: TestContext;
  beforeAll(async () => (t = await createTestApp()));
  afterAll(() => t.close());
  beforeEach(() => t.reset());
  afterEach(() => jest.restoreAllMocks());

  const fund = async (id: string, amount: number) => t.tx(id, { type: 'credit', amount, reference_id: `fund-${id}` }).expect(201);
  const transfer = (body: Record<string, unknown>) => t.http().post('/transfers').send(body);
  const ledgerCount = async () => (await t.ds.query('SELECT count(*)::int AS c FROM transactions'))[0].c;
  const body = (a: string, b: string, amount: number | string, ref = 'tr-1') => ({
    from_account_id: a, to_account_id: b, amount, reference_id: ref,
  });

  it('moves money: A 100 / B 50, transfer 30 => A 70 / B 80', async () => {
    const a = await t.createAccount('A');
    const b = await t.createAccount('B');
    await fund(a, 100);
    await fund(b, 50);

    const res = await transfer(body(a, b, 30)).expect(201);
    expect(res.body.from_account).toEqual({ id: a, balance: '70.00' });
    expect(res.body.to_account).toEqual({ id: b, balance: '80.00' });
    expect(res.body.debit_transaction).toMatchObject({ account_id: a, type: 'debit', amount: '30.00', transfer_id: res.body.transfer_id });
    expect(res.body.credit_transaction).toMatchObject({ account_id: b, type: 'credit', amount: '30.00', transfer_id: res.body.transfer_id });
    expect(await t.balance(a)).toBe('70.00');
    expect(await t.balance(b)).toBe('80.00');
  });

  it('both legs appear in each account history', async () => {
    const a = await t.createAccount('A');
    const b = await t.createAccount('B');
    await fund(a, 100);
    await transfer(body(a, b, 30)).expect(201);
    const hist = await t.http().get(`/accounts/${b}/transactions`).expect(200);
    expect(hist.body.data).toHaveLength(1);
    expect(hist.body.data[0]).toMatchObject({ type: 'credit', amount: '30.00', reference_id: 'tr-1' });
  });

  it('insufficient source balance => 422, nothing changes', async () => {
    const a = await t.createAccount('A');
    const b = await t.createAccount('B');
    await fund(a, 100);
    const res = await transfer(body(a, b, 150)).expect(422);
    expect(res.body.error).toBe('INSUFFICIENT_BALANCE');
    expect(await t.balance(a)).toBe('100.00');
    expect(await t.balance(b)).toBe('0.00');
    expect(await ledgerCount()).toBe(1);
  });

  it('404 when either account is missing, nothing changes', async () => {
    const a = await t.createAccount('A');
    await fund(a, 100);
    const ghost = '11111111-1111-4111-8111-111111111111';
    expect((await transfer(body(a, ghost, 10)).expect(404)).body.error).toBe('ACCOUNT_NOT_FOUND');
    expect((await transfer(body(ghost, a, 10)).expect(404)).body.error).toBe('ACCOUNT_NOT_FOUND');
    expect(await t.balance(a)).toBe('100.00');
    expect(await ledgerCount()).toBe(1);
  });

  it('400 when source and destination are the same account', async () => {
    const a = await t.createAccount('A');
    await fund(a, 100);
    const res = await transfer(body(a, a, 10)).expect(400);
    expect(res.body.error).toBe('SAME_ACCOUNT_TRANSFER');
    expect(await t.balance(a)).toBe('100.00');
  });

  it.each([
    ['zero amount', { amount: 0 }],
    ['negative amount', { amount: -1 }],
    ['bad amount', { amount: 'x' }],
    ['missing reference', { reference_id: undefined }],
    ['bad source id', { from_account_id: 'nope' }],
    ['unknown field', { fee: 1 }],
  ])('400 for %s', async (_n, override) => {
    const a = await t.createAccount('A');
    const b = await t.createAccount('B');
    await fund(a, 100);
    const res = await transfer({ ...body(a, b, 10), ...override }).expect(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect(await t.balance(a)).toBe('100.00');
  });

  describe('duplicates', () => {
    it('replaying a transfer => 409 and no second movement', async () => {
      const a = await t.createAccount('A');
      const b = await t.createAccount('B');
      await fund(a, 100);
      await transfer(body(a, b, 30)).expect(201);
      const res = await transfer(body(a, b, 30)).expect(409);
      expect(res.body.error).toBe('DUPLICATE_TRANSACTION');
      expect(await t.balance(a)).toBe('70.00');
      expect(await t.balance(b)).toBe('30.00');
      expect(await ledgerCount()).toBe(3);
    });

    it('reference already used on the DESTINATION => 409 and source is untouched (no partial transfer)', async () => {
      const a = await t.createAccount('A');
      const b = await t.createAccount('B');
      await fund(a, 100);
      await t.tx(b, { type: 'credit', amount: 5, reference_id: 'tr-1' }).expect(201);
      await transfer(body(a, b, 30)).expect(409);
      expect(await t.balance(a)).toBe('100.00');
      expect(await t.balance(b)).toBe('5.00');
    });
  });

  describe('atomicity', () => {
    it('failure while writing the credit leg rolls back the debit leg too', async () => {
      const a = await t.createAccount('A');
      const b = await t.createAccount('B');
      await fund(a, 100);
      await fund(b, 50);

      const original = (TransactionsService.prototype as any).insertEntry;
      jest
        .spyOn(TransactionsService.prototype as any, 'insertEntry')
        .mockImplementationOnce(function (this: any, ...args: any[]) { return original.apply(this, args); }) // debit leg succeeds
        .mockRejectedValueOnce(new Error('credit leg failed'));
      await transfer(body(a, b, 30)).expect(500);
      jest.restoreAllMocks();

      expect(await t.balance(a)).toBe('100.00');
      expect(await t.balance(b)).toBe('50.00');
      expect(await ledgerCount()).toBe(2);
    });
  });

  describe('concurrency', () => {
    it('opposite-direction transfers do not deadlock and conserve money', async () => {
      const a = await t.createAccount('A');
      const b = await t.createAccount('B');
      await fund(a, 1000);
      await fund(b, 1000);
      const results = await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          i % 2 ? transfer(body(a, b, 10, `ab-${i}`)) : transfer(body(b, a, 10, `ba-${i}`)),
        ),
      );
      expect(results.every((r) => r.status === 201)).toBe(true);
      expect(Number(await t.balance(a)) + Number(await t.balance(b))).toBe(2000);
      expect(await t.balance(a)).toBe('1000.00'); // 10 each way
    });

    it('concurrent transfers cannot overdraw the source', async () => {
      const a = await t.createAccount('A');
      const b = await t.createAccount('B');
      await fund(a, 100);
      const results = await Promise.all(
        Array.from({ length: 10 }, (_, i) => transfer(body(a, b, 30, `c-${i}`))),
      );
      expect(results.filter((r) => r.status === 201)).toHaveLength(3);
      expect(results.filter((r) => r.status === 422)).toHaveLength(7);
      expect(await t.balance(a)).toBe('10.00');
      expect(await t.balance(b)).toBe('90.00');
    });
  });
});
