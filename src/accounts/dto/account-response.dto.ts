import { ApiProperty } from '@nestjs/swagger';
import { Account } from '../account.entity';

export class AccountResponseDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
  @ApiProperty({ example: '0.00' }) balance: string;
  @ApiProperty({ format: 'date-time' }) created_at: Date;

  static from(a: Account): AccountResponseDto {
    return { id: a.id, name: a.name, balance: a.balance, created_at: a.createdAt };
  }
}

export class BalanceResponseDto {
  @ApiProperty({ format: 'uuid' }) account_id: string;
  @ApiProperty({ example: '100.00' }) balance: string;
}
