import { createTestApp, TestContext } from './setup/test-app';

describe('Transaction history', () => {
  let t: TestContext;
  let id: string;
  beforeAll(async () => (t = await createTestApp()));
  afterAll(() => t.close());
  beforeEach(async () => {
    await t.reset();
    id = await t.createAccount();
    // 5 credits then 3 debits, created sequentially => ref-0 oldest, ref-7 newest
    for (let i = 0; i < 8; i++) {
      await t.tx(id, { type: i < 5 ? 'credit' : 'debit', amount: 10, reference_id: `ref-${i}` }).expect(201);
    }
  });
  const get = (qs = '') => t.http().get(`/accounts/${id}/transactions${qs}`);

  it('returns both types, latest first, with pagination meta by default', async () => {
    const res = await get().expect(200);
    expect(res.body.data.map((x: any) => x.reference_id)).toEqual(
      ['ref-7', 'ref-6', 'ref-5', 'ref-4', 'ref-3', 'ref-2', 'ref-1', 'ref-0'],
    );
    expect(res.body.meta).toEqual({ current_page: 1, page_size: 20, total_records: 8, total_pages: 1 });
  });

  it('filters by type', async () => {
    const credits = await get('?type=credit').expect(200);
    expect(credits.body.data).toHaveLength(5);
    expect(credits.body.data.every((x: any) => x.type === 'credit')).toBe(true);
    expect(credits.body.meta.total_records).toBe(5);

    const debits = await get('?type=debit').expect(200);
    expect(debits.body.data.map((x: any) => x.reference_id)).toEqual(['ref-7', 'ref-6', 'ref-5']);
  });

  it('paginates', async () => {
    const p1 = await get('?page=1&limit=3').expect(200);
    const p3 = await get('?page=3&limit=3').expect(200);
    expect(p1.body.data.map((x: any) => x.reference_id)).toEqual(['ref-7', 'ref-6', 'ref-5']);
    expect(p3.body.data.map((x: any) => x.reference_id)).toEqual(['ref-1', 'ref-0']);
    expect(p3.body.meta).toEqual({ current_page: 3, page_size: 3, total_records: 8, total_pages: 3 });
  });

  it('combines filter and pagination', async () => {
    const res = await get('?type=credit&page=2&limit=2').expect(200);
    expect(res.body.data.map((x: any) => x.reference_id)).toEqual(['ref-2', 'ref-1']);
    expect(res.body.meta).toEqual({ current_page: 2, page_size: 2, total_records: 5, total_pages: 3 });
  });

  it('returns an empty page (200) beyond the last page', async () => {
    const res = await get('?page=99&limit=5').expect(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.total_records).toBe(8);
  });

  it('returns an empty list for an account with no transactions', async () => {
    const empty = await t.createAccount('Empty');
    const res = await t.http().get(`/accounts/${empty}/transactions`).expect(200);
    expect(res.body).toEqual({ data: [], meta: { current_page: 1, page_size: 20, total_records: 0, total_pages: 0 } });
  });

  it.each(['?page=0', '?page=-1', '?page=abc', '?page=1.5', '?limit=0', '?limit=101', '?limit=abc', '?type=refund', '?type='])(
    '400 for invalid query %s',
    async (qs) => {
      const res = await get(qs).expect(400);
      expect(res.body).toMatchObject({ statusCode: 400, error: 'VALIDATION_ERROR' });
    },
  );

  it('does not leak other accounts transactions', async () => {
    const other = await t.createAccount('Other');
    await t.tx(other, { type: 'credit', amount: 1, reference_id: 'other-1' }).expect(201);
    const res = await get().expect(200);
    expect(res.body.meta.total_records).toBe(8);
  });

  it('404 for unknown account, 400 for malformed id', async () => {
    await t.http().get('/accounts/11111111-1111-4111-8111-111111111111/transactions').expect(404);
    await t.http().get('/accounts/bad/transactions').expect(400);
  });
});
