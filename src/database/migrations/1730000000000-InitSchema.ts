import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitSchema1730000000000 implements MigrationInterface {
  name = 'InitSchema1730000000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE accounts (
        id         uuid          NOT NULL DEFAULT gen_random_uuid(),
        name       varchar(255)  NOT NULL,
        balance    numeric(19,2) NOT NULL DEFAULT 0,
        created_at timestamptz   NOT NULL DEFAULT now(),
        CONSTRAINT pk_accounts PRIMARY KEY (id),
        CONSTRAINT chk_accounts_name_not_blank CHECK (length(btrim(name)) > 0),
        CONSTRAINT chk_accounts_balance_non_negative CHECK (balance >= 0)
      )`);

    await q.query(`
      CREATE TABLE transactions (
        id           uuid          NOT NULL DEFAULT gen_random_uuid(),
        account_id   uuid          NOT NULL,
        type         varchar(6)    NOT NULL,
        amount       numeric(19,2) NOT NULL,
        description  varchar(500),
        reference_id varchar(100)  NOT NULL,
        transfer_id  uuid,
        created_at   timestamptz   NOT NULL DEFAULT clock_timestamp(),
        CONSTRAINT pk_transactions PRIMARY KEY (id),
        CONSTRAINT fk_transactions_account FOREIGN KEY (account_id)
          REFERENCES accounts (id) ON DELETE RESTRICT,
        CONSTRAINT uq_transactions_account_reference UNIQUE (account_id, reference_id),
        CONSTRAINT chk_transactions_type CHECK (type IN ('credit', 'debit')),
        CONSTRAINT chk_transactions_amount_positive CHECK (amount > 0),
        CONSTRAINT chk_transactions_reference_not_blank CHECK (length(btrim(reference_id)) > 0)
      )`);

    await q.query(`
      CREATE INDEX idx_transactions_account_created
        ON transactions (account_id, created_at DESC, id DESC)`);

    // Immutability enforced in the database, independent of the API surface.
    await q.query(`
      CREATE FUNCTION prevent_transaction_mutation() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'transactions are immutable (% not allowed)', TG_OP;
      END;
      $$ LANGUAGE plpgsql`);
    await q.query(`
      CREATE TRIGGER trg_transactions_immutable
        BEFORE UPDATE OR DELETE ON transactions
        FOR EACH ROW EXECUTE FUNCTION prevent_transaction_mutation()`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TRIGGER IF EXISTS trg_transactions_immutable ON transactions`);
    await q.query(`DROP FUNCTION IF EXISTS prevent_transaction_mutation()`);
    await q.query(`DROP TABLE IF EXISTS transactions`);
    await q.query(`DROP TABLE IF EXISTS accounts`);
  }
}
