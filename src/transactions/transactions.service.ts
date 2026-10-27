import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { buildPaginationMeta } from '../common/dto/pagination-query.dto';
import { Account } from '../accounts/account.entity';
import { AccountsService } from '../accounts/accounts.service';
import {
  AccountNotFoundException,
  DuplicateTransactionException,
  InsufficientBalanceException,
} from '../common/errors/domain.exceptions';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { TransactionQueryDto } from './dto/transaction-query.dto';
import { Transaction, TransactionType } from './transaction.entity';
import { TransactionResponseDto } from './dto/transaction-response.dto';

export interface LedgerEntry {
  accountId: string;
  type: TransactionType;
  amount: string;
  description?: string | null;
  referenceId: string;
  transferId?: string | null;
}

@Injectable()
export class TransactionsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Transaction) private readonly transactions: Repository<Transaction>,
    private readonly accounts: AccountsService,
  ) {}

  /**
   * Insert a transaction and move the balance as one atomic unit.
   * The account row is locked (FOR UPDATE) so concurrent writers on the same
   * account are serialized; anything thrown rolls both changes back.
   */
  async create(accountId: string, dto: CreateTransactionDto) {
    return this.dataSource.transaction(async (em) => {
      const [account] = await this.lockAccounts(em, [accountId]);
      if (!account) throw new AccountNotFoundException(accountId);

      await this.assertReferenceUnused(em, accountId, dto.reference_id);

      const { transaction, balanceAfter } = await this.applyEntry(em, {
        accountId,
        type: dto.type,
        amount: dto.amount,
        description: dto.description ?? null,
        referenceId: dto.reference_id,
      });
      return { ...TransactionResponseDto.from(transaction), balance_after: balanceAfter };
    });
  }

  async history(accountId: string, query: TransactionQueryDto) {
    await this.accounts.getOrFail(accountId);
    const { page, limit, type } = query;
    const [rows, total] = await this.transactions.findAndCount({
      where: { accountId, ...(type ? { type } : {}) },
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data: rows.map(TransactionResponseDto.from), meta: buildPaginationMeta(page, limit, total) };
  }

  /** Lock account rows in id order (consistent order => no deadlocks between transfers). */
  async lockAccounts(em: EntityManager, ids: string[]): Promise<Account[]> {
    return em
      .createQueryBuilder(Account, 'a')
      .setLock('pessimistic_write')
      .where('a.id IN (:...ids)', { ids })
      .orderBy('a.id', 'ASC')
      .getMany();
  }

  async assertReferenceUnused(em: EntityManager, accountId: string, referenceId: string): Promise<void> {
    const existing = await em.findOne(Transaction, { where: { accountId, referenceId } });
    if (existing) throw new DuplicateTransactionException(TransactionResponseDto.from(existing));
  }

  /** Caller must hold the account lock and have checked the reference. */
  async applyEntry(em: EntityManager, entry: LedgerEntry) {
    const balanceAfter = await this.updateBalance(em, entry);
    const transaction = await this.insertEntry(em, entry);
    return { transaction, balanceAfter };
  }

  private async updateBalance(em: EntityManager, e: LedgerEntry): Promise<string> {
    const qb = em
      .createQueryBuilder()
      .update(Account)
      .set({ balance: () => (e.type === 'credit' ? 'balance + CAST(:amt AS numeric)' : 'balance - CAST(:amt AS numeric)') })
      .where('id = :id', { id: e.accountId })
      .setParameter('amt', e.amount)
      .returning('balance');
    // A debit only applies when funds suffice; the DB CHECK (balance >= 0) is a second line of defence.
    if (e.type === 'debit') qb.andWhere('balance >= CAST(:amt AS numeric)');

    const result = await qb.execute();
    if (!result.affected) throw new InsufficientBalanceException(e.accountId, e.amount);
    return result.raw[0].balance;
  }

  private async insertEntry(em: EntityManager, e: LedgerEntry): Promise<Transaction> {
    const result = await em
      .createQueryBuilder()
      .insert()
      .into(Transaction)
      .values({
        accountId: e.accountId,
        type: e.type,
        amount: e.amount,
        description: e.description ?? null,
        referenceId: e.referenceId,
        transferId: e.transferId ?? null,
      })
      .returning(['id', 'amount', 'created_at'])
      .execute();
    const row = result.raw[0];
    return Object.assign(new Transaction(), {
      id: row.id,
      accountId: e.accountId,
      type: e.type,
      amount: row.amount,
      description: e.description ?? null,
      referenceId: e.referenceId,
      transferId: e.transferId ?? null,
      createdAt: row.created_at,
    });
  }
}
