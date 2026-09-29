type StaffAuthInput = {
  identifier: string;
  password: string;
  device_token?: string;
};

export type MfaMethodInput = 'authenticator' | 'email';

function parseMfaMethod(value: unknown): MfaMethodInput | undefined {
  return value === 'authenticator' || value === 'email' ? value : undefined;
}

type TotpCodeInput = {
  code: string;
  method: MfaMethodInput;
  remember_device: boolean;
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

    const deviceToken =
      typeof candidate.device_token === 'string' && candidate.device_token
        ? candidate.device_token
        : undefined;

    return {
      success: true,
      data: {
        identifier,
        password,
        ...(deviceToken ? { device_token: deviceToken } : {}),
      },
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
      data: {
        code,
        method: parseMfaMethod(candidate.method) ?? 'authenticator',
        remember_device: candidate.remember_device === true,
      },
    };
  },
};

export interface MfaEnrollInput {
  method: MfaMethodInput;
}

export const mfaEnrollValidator = {
  safeParse(
    input: unknown
  ):
    | { success: true; data: MfaEnrollInput }
    | { success: false; error: { issues: Array<{ message: string }> } } {
    const candidate =
      typeof input === 'object' && input !== null
        ? (input as Record<string, unknown>)
        : {};

    return {
      success: true,
      data: { method: parseMfaMethod(candidate.method) ?? 'authenticator' },
    };
  },
};

export interface MfaUnenrollInput {
  method: MfaMethodInput;
}

export const mfaUnenrollValidator = {
  safeParse(
    input: unknown
  ):
    | { success: true; data: MfaUnenrollInput }
    | { success: false; error: { issues: Array<{ message: string }> } } {
    const candidate =
      typeof input === 'object' && input !== null
        ? (input as Record<string, unknown>)
        : {};
    const method = parseMfaMethod(candidate.method);

    if (!method) {
      return {
        success: false,
        error: {
          issues: [{ message: 'method must be "authenticator" or "email"' }],
        },
      };
    }

    return { success: true, data: { method } };
  },
};

export interface MfaPreferenceInput {
  preferred_method: MfaMethodInput;
}

export const mfaPreferenceValidator = {
  safeParse(
    input: unknown
  ):
    | { success: true; data: MfaPreferenceInput }
    | { success: false; error: { issues: Array<{ message: string }> } } {
    const candidate =
      typeof input === 'object' && input !== null
        ? (input as Record<string, unknown>)
        : {};
    const preferredMethod = parseMfaMethod(candidate.preferred_method);

    if (!preferredMethod) {
      return {
        success: false,
        error: {
          issues: [
            { message: 'preferred_method must be "authenticator" or "email"' },
          ],
        },
      };
    }

    return { success: true, data: { preferred_method: preferredMethod } };
  },
};
