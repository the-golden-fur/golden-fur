export interface StaffLoginPayload {
  identifier: string;
  password: string;
}

export interface StaffAuthContext {
  role: string;
  branchId: string;
  userId: string;
}
