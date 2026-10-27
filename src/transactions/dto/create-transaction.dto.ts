import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { IsMoneyAmount } from '../../common/dto/money-amount.decorator';

export const TRANSACTION_TYPES = ['credit', 'debit'] as const;
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateTransactionDto {
  @ApiProperty({ enum: TRANSACTION_TYPES })
  @IsIn(TRANSACTION_TYPES, { message: 'type must be either credit or debit' })
  type: (typeof TRANSACTION_TYPES)[number];

  @IsMoneyAmount()
  amount: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ example: 'order-1001', maxLength: 100, description: 'Unique per account' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'reference_id is required' })
  @MaxLength(100)
  reference_id: string;
}
