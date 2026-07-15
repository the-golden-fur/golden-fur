type StaffAuthInput = {
  identifier: string;
  password: string;
};

type TotpCodeInput = {
  code: string;
};

export const staffAuthValidator = {
  safeParse(
    input: unknown
  ):
    | { success: true; data: StaffAuthInput }
    | { success: false; error: { issues: Array<{ message: string }> } } {
    if (typeof input !== 'object' || input === null) {
      return {
        success: false,
        error: {
          issues: [{ message: 'Invalid login payload' }],
        },
      };
    }

    const candidate = input as Record<string, unknown>;
    const identifier =
      typeof candidate.identifier === 'string'
        ? candidate.identifier.trim()
        : typeof candidate.username === 'string'
          ? candidate.username.trim()
          : '';
    const password =
      typeof candidate.password === 'string' ? candidate.password.trim() : '';

    if (!identifier || !password) {
      return {
        success: false,
        error: {
          issues: [{ message: 'Invalid login payload' }],
        },
      };
    }

    return {
      success: true,
      data: { identifier, password },
    };
  },
};

export const totpValidator = {
  safeParse(
    input: unknown
  ):
    | { success: true; data: TotpCodeInput }
    | { success: false; error: { issues: Array<{ message: string }> } } {
    if (typeof input !== 'object' || input === null) {
      return {
        success: false,
        error: { issues: [{ message: 'Invalid TOTP payload' }] },
      };
    }

    const candidate = input as Record<string, unknown>;
    const code =
      typeof candidate.code === 'string' ? candidate.code.trim() : '';

    if (!code || !/^\d{6}$/.test(code)) {
      return {
        success: false,
        error: { issues: [{ message: 'Code must be exactly 6 digits' }] },
      };
    }

    return {
      success: true,
      data: { code },
    };
  },
};
