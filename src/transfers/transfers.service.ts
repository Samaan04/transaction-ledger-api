import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import {
  AccountNotFoundException,
  DomainException,
  ErrorCode,
} from '../common/errors/domain.exceptions';
import { TransactionResponseDto } from '../transactions/dto/transaction-response.dto';
import { TransactionsService } from '../transactions/transactions.service';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { TransferResponseDto } from './dto/transfer-response.dto';

@Injectable()
export class TransfersService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly ledger: TransactionsService,
  ) {}

  /**
   * Debit source + credit destination in ONE database transaction. Both account rows are
   * locked in id order (no deadlocks between opposite transfers); any failure rolls back both legs.
   * The same reference_id is stored on both legs, which per-account uniqueness allows, so
   * replaying a transfer is rejected with 409 and changes nothing.
   */
  async create(dto: CreateTransferDto): Promise<TransferResponseDto> {
    const { from_account_id: from, to_account_id: to, amount, reference_id: referenceId } = dto;
    if (from === to) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.SAME_ACCOUNT_TRANSFER,
        'Source and destination accounts must be different',
      );
    }

    return this.dataSource.transaction(async (em) => {
      const locked = await this.ledger.lockAccounts(em, [from, to]);
      for (const id of [from, to]) {
        if (!locked.some((a) => a.id === id)) throw new AccountNotFoundException(id);
      }
      await this.ledger.assertReferenceUnused(em, from, referenceId);
      await this.ledger.assertReferenceUnused(em, to, referenceId);

      const transferId = randomUUID();
      const description = dto.description ?? null;
      const debit = await this.ledger.applyEntry(em, { accountId: from, type: 'debit', amount, description, referenceId, transferId });
      const credit = await this.ledger.applyEntry(em, { accountId: to, type: 'credit', amount, description, referenceId, transferId });

      return {
        transfer_id: transferId,
        reference_id: referenceId,
        amount: debit.transaction.amount,
        from_account: { id: from, balance: debit.balanceAfter },
        to_account: { id: to, balance: credit.balanceAfter },
        debit_transaction: TransactionResponseDto.from(debit.transaction),
        credit_transaction: TransactionResponseDto.from(credit.transaction),
      };
    });
  }
}
