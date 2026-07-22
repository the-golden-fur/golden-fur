import { AppError } from './AppError.ts';

export class ValidationError extends AppError {
  public readonly details?: unknown;

  constructor(message = 'Validation failed', details?: unknown) {
    super(message, 400, true, 'VALIDATION_ERROR');
    this.details = details;
  }
}
