export interface StaffLoginPayload {
  username: string;
  password: string;
}

export interface StaffAuthContext {
  role: string;
  branchId: string;
  userId: string;
}
