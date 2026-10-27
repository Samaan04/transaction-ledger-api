import { INestApplication, ValidationError, ValidationPipe } from '@nestjs/common';
import { HttpStatus } from '@nestjs/common';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter';
import { DomainException, ErrorCode } from './common/errors/domain.exceptions';

function flatten(errors: ValidationError[], parent = ''): { field: string; messages: string[] }[] {
  return errors.flatMap((e) => {
    const field = parent ? `${parent}.${e.property}` : e.property;
    const own = e.constraints ? [{ field, messages: Object.values(e.constraints) }] : [];
    return [...own, ...flatten(e.children ?? [], field)];
  });
}

/** Shared by main.ts and the e2e tests so both run the exact same pipeline. */
export function configureApp(app: INestApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      exceptionFactory: (errors) =>
        new DomainException(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_ERROR, 'Request validation failed', flatten(errors)),
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
}
