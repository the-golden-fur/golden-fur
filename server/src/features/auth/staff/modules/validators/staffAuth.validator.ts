type StaffAuthInput = {
  username: string;
  password: string;
};

export const staffAuthValidator = {
  safeParse(input: unknown): { success: true; data: StaffAuthInput } | { success: false; error: { issues: Array<{ message: string }> } } {
    if (typeof input !== 'object' || input === null) {
      return {
        success: false,
        error: {
          issues: [{ message: 'Invalid login payload' }],
        },
      };
    }

    const candidate = input as Record<string, unknown>;
    const username = typeof candidate.username === 'string' ? candidate.username.trim() : '';
    const password = typeof candidate.password === 'string' ? candidate.password.trim() : '';

    if (!username || !password) {
      return {
        success: false,
        error: {
          issues: [{ message: 'Invalid login payload' }],
        },
      };
    }

    return {
      success: true,
      data: { username, password },
    };
  },
};
