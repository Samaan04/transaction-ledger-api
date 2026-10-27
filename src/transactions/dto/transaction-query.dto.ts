import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { TRANSACTION_TYPES } from './create-transaction.dto';

export class TransactionQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: TRANSACTION_TYPES, description: 'Omit to return both types' })
  @IsOptional()
  @IsIn(TRANSACTION_TYPES, { message: 'type must be either credit or debit' })
  type?: (typeof TRANSACTION_TYPES)[number];
}
