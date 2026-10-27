import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { TransferResponseDto } from './dto/transfer-response.dto';
import { TransfersService } from './transfers.service';

@ApiTags('transfers')
@Controller('transfers')
export class TransfersController {
  constructor(private readonly service: TransfersService) {}

  @Post()
  @ApiOperation({ summary: 'Atomically move money between two accounts' })
  @ApiResponse({ status: 201, type: TransferResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error / same source and destination' })
  @ApiResponse({ status: 404, description: 'Source or destination account not found' })
  @ApiResponse({ status: 409, description: 'reference_id already used by either account (nothing changed)' })
  @ApiResponse({ status: 422, description: 'Insufficient balance in source account (nothing changed)' })
  create(@Body() dto: CreateTransferDto) {
    return this.service.create(dto);
  }
}
