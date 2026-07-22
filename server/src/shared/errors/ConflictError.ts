import { AppError } from './AppError.ts';

export class ConflictError extends AppError {
  constructor(message = 'Conflict') {
    super(message, 409, true, 'CONFLICT');
  }
}
