import { AppError } from './AppError.ts';

export class ValidationError extends AppError {
  details?: unknown;

  constructor(message = 'Validation Error', details?: unknown) {
    super(message, 400);
    this.details = details;
  }
}
