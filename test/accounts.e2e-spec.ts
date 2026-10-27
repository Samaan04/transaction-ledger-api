import { createTestApp, TestContext } from './setup/test-app';

describe('Accounts', () => {
  let t: TestContext;
  beforeAll(async () => (t = await createTestApp()));
  afterAll(() => t.close());
  beforeEach(() => t.reset());

  it('creates an account with balance 0, a generated id and created_at', async () => {
    const res = await t.http().post('/accounts').send({ name: '  Alice  ' }).expect(201);
    expect(res.body).toMatchObject({ name: 'Alice', balance: '0.00' });
    expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(new Date(res.body.created_at).getTime()).not.toBeNaN();
  });

  it('generates unique ids', async () => {
    const a = await t.createAccount();
    const b = await t.createAccount();
    expect(a).not.toBe(b);
  });

  it.each([{}, { name: '' }, { name: '   ' }, { name: 123 }])('rejects invalid name %j with 400', async (body) => {
    const res = await t.http().post('/accounts').send(body).expect(400);
    expect(res.body).toMatchObject({ statusCode: 400, error: 'VALIDATION_ERROR' });
    expect(res.body.details.length).toBeGreaterThan(0);
  });

  it('does not let the client set the initial balance', async () => {
    const res = await t.http().post('/accounts').send({ name: 'Mallory', balance: 1000 }).expect(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(res.body.details)).toContain('balance');
    const [{ count }] = await t.ds.query('SELECT count(*)::int AS count FROM accounts');
    expect(count).toBe(0);
  });

  it('rejects malformed JSON with a consistent 400', async () => {
    const res = await t.http().post('/accounts').set('Content-Type', 'application/json').send('{bad').expect(400);
    expect(res.body).toMatchObject({ statusCode: 400, error: 'INVALID_REQUEST_BODY' });
  });

  describe('GET balance', () => {
    it('returns account_id and balance', async () => {
      const id = await t.createAccount();
      const res = await t.http().get(`/accounts/${id}/balance`).expect(200);
      expect(res.body).toEqual({ account_id: id, balance: '0.00' });
    });

    it('404 for unknown account', async () => {
      const res = await t.http().get('/accounts/11111111-1111-4111-8111-111111111111/balance').expect(404);
      expect(res.body).toMatchObject({ statusCode: 404, error: 'ACCOUNT_NOT_FOUND' });
    });

    it('400 for malformed account id', async () => {
      const res = await t.http().get('/accounts/not-a-uuid/balance').expect(400);
      expect(res.body).toMatchObject({ statusCode: 400, error: 'INVALID_ACCOUNT_ID' });
    });
  });
});
