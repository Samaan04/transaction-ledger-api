import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Matches } from 'class-validator';

/**
 * Money input: a JSON number or numeric string, > 0, at most 2 decimals,
 * at most 17 integer digits (numeric(19,2)). Kept as a string end to end so no
 * float arithmetic ever touches it.
 */
export function IsMoneyAmount() {
  return applyDecorators(
    ApiProperty({ example: '50.25', description: 'Greater than 0, max 2 decimal places (number or string)' }),
    Transform(({ value }) => (typeof value === 'number' ? String(value) : value)),
    IsString({ message: 'amount must be a number with at most 2 decimal places' }),
    Matches(/^\d{1,17}(\.\d{1,2})?$/, { message: 'amount must be a number with at most 2 decimal places' }),
    Matches(/[1-9]/, { message: 'amount must be greater than 0' }),
  );
}
