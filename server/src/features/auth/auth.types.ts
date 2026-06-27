export type { AuthenticatedRequest, JwtPayload } from '../../shared/shared.types.ts';

export interface StaffLoginRequest {
  username: string;
  password: string;
}

export interface StaffLoginResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}
