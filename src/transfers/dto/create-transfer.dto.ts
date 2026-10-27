import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { IsMoneyAmount } from '../../common/dto/money-amount.decorator';

export class CreateTransferDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all', { message: 'from_account_id must be a valid UUID' })
  from_account_id: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('all', { message: 'to_account_id must be a valid UUID' })
  to_account_id: string;

  @IsMoneyAmount()
  amount: string;

  @ApiProperty({ example: 'transfer-2001', maxLength: 100, description: 'Idempotency key; recorded on both legs' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'reference_id is required' })
  @MaxLength(100)
  reference_id: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
