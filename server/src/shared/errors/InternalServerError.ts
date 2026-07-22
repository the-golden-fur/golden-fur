import { AppError } from './AppError.ts';

export class InternalServerError extends AppError {
  constructor(message = 'Internal server error') {
    super(message, 500, true, 'SERVER_ERROR');
  }
}
