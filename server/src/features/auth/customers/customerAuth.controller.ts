import type { Request, Response } from 'express';
import { supabase } from '../../../config/supabase/supabase.config.ts';
import {
  customerSignupValidator,
  customerLoginValidator,
} from './modules/validators/customerAuth.validator.ts';
import { mergeOrCreate } from './services/accountMerge.service.ts';

export async function customerSignupController(req: Request, res: Response) {
  const parsed = customerSignupValidator.safeParse(req.body);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  const { full_name, account_email, password } = parsed.data;

  try {
    // 1. Create Supabase Auth user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: account_email,
      password,
      options: {
        data: {
          full_name,
        },
      },
    });

    if (authError || !authData.user) {
      return res
        .status(400)
        .json({ error: authError?.message || 'Failed to sign up' });
    }

    // 2. Insert into customer_profiles
    const { error: profileError } = await supabase
      .from('customer_profiles')
      .insert({
        id: authData.user.id,
        account_email,
        full_name,
        primary_auth_provider: 'email',
      });

    if (profileError) {
      // Roll back the auth user so a retry with the same email doesn't
      // fail with "already registered" against a profile-less account.
      await supabase.auth.admin.deleteUser(authData.user.id);

      return res.status(500).json({
        error:
          'Signed up but failed to create profile: ' + profileError.message,
      });
    }

    return res.status(201).json({
      message: 'Signup successful',
      user: authData.user,
      session: authData.session,
    });
  } catch (error) {
    console.error('Signup error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function customerLoginController(req: Request, res: Response) {
  const parsed = customerLoginValidator.safeParse(req.body);

  if (!parsed.success) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { account_email, password } = parsed.data;

  try {
    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({
        email: account_email,
        password,
      });

    if (authError || !authData.session) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    return res.status(200).json({
      access_token: authData.session.access_token,
      refresh_token: authData.session.refresh_token,
      expires_in: authData.session.expires_in,
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function customerOauthCallbackController(
  req: Request,
  res: Response
) {
  // In a real OAuth flow with an API, the client handles the redirect from Google/Facebook,
  // gets the token from the URL hash, and sends the session/access_token to the server to verify.
  // We'll expect the client to send the access_token in the Authorization header.

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed token' });
  }

  const token = authHeader.slice('Bearer '.length);

  try {
    const { data: authData, error: authError } =
      await supabase.auth.getUser(token);

    if (authError || !authData.user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Since mergeOrCreate expects a Session object for `session.user`, we can construct a dummy session object
    // Or we can just use the user object directly. We will mock a session object.
    const mockSession = { user: authData.user } as any;

    const result = await mergeOrCreate(mockSession);

    return res.status(200).json({
      success: true,
      action: result.action,
      profile: result.profile,
    });
  } catch (error: any) {
    return res
      .status(500)
      .json({ error: error.message || 'Internal server error' });
  }
}
