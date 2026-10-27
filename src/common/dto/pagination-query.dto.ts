import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class PaginationQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}

export class PaginationMetaDto {
  @ApiPropertyOptional() current_page: number;
  @ApiPropertyOptional() page_size: number;
  @ApiPropertyOptional() total_records: number;
  @ApiPropertyOptional() total_pages: number;
}

export function buildPaginationMeta(page: number, limit: number, total: number): PaginationMetaDto {
  return { current_page: page, page_size: limit, total_records: total, total_pages: Math.ceil(total / limit) };
}
