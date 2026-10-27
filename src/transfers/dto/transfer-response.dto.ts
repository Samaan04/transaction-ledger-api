import { ApiProperty } from '@nestjs/swagger';
import { TransactionResponseDto } from '../../transactions/dto/transaction-response.dto';

class TransferAccountDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: '70.00', description: 'Balance after the transfer' }) balance: string;
}

export class TransferResponseDto {
  @ApiProperty({ format: 'uuid' }) transfer_id: string;
  @ApiProperty() reference_id: string;
  @ApiProperty({ example: '30.00' }) amount: string;
  @ApiProperty({ type: TransferAccountDto }) from_account: TransferAccountDto;
  @ApiProperty({ type: TransferAccountDto }) to_account: TransferAccountDto;
  @ApiProperty({ type: TransactionResponseDto }) debit_transaction: TransactionResponseDto;
  @ApiProperty({ type: TransactionResponseDto }) credit_transaction: TransactionResponseDto;
}
