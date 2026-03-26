import { BadRequestException, ValidationError } from '@nestjs/common';

function formatValidationError(error: ValidationError): unknown {
  return {
    property: error.property,
    constraints: error.constraints ?? {},
    ...(error.children?.length
      ? {
          children: error.children.map(formatValidationError),
        }
      : {}),
  };
}

export function validationExceptionFactory(
  errors: ValidationError[],
): BadRequestException {
  return new BadRequestException({
    code: 'VALIDATION_ERROR',
    message: 'Request validation failed',
    details: errors.map(formatValidationError),
  });
}
