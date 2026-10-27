import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaDto } from '../../common/dto/pagination-query.dto';
import { Transaction } from '../transaction.entity';

export class TransactionResponseDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) account_id: string;
  @ApiProperty({ enum: ['credit', 'debit'] }) type: string;
  @ApiProperty({ example: '50.00' }) amount: string;
  @ApiProperty({ nullable: true }) description: string | null;
  @ApiProperty() reference_id: string;
  @ApiProperty({ format: 'uuid', nullable: true }) transfer_id: string | null;
  @ApiProperty({ format: 'date-time' }) created_at: Date;

  static from(t: Transaction): TransactionResponseDto {
    return {
      id: t.id,
      account_id: t.accountId,
      type: t.type,
      amount: t.amount,
      description: t.description,
      reference_id: t.referenceId,
      transfer_id: t.transferId,
      created_at: t.createdAt,
    };
  }
}

export class CreatedTransactionResponseDto extends TransactionResponseDto {
  @ApiProperty({ example: '150.00', description: 'Account balance after this transaction' })
  balance_after: string;
}

export class TransactionHistoryResponseDto {
  @ApiProperty({ type: [TransactionResponseDto] }) data: TransactionResponseDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta: PaginationMetaDto;
}
