import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../../../../../shared/auth/providers/AuthProvider/useAuth';
import {
  login,
  signInWithGoogle,
  signInWithFacebook,
} from '../../../api/customerAuth.api';
import { customerLoginSchema } from '../../../modules/validators/customerAuth.validator';

export function CustomerLoginForm() {
  const navigate = useNavigate();
  const { applySession } = useAuth();
  const [accountEmail, setAccountEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const parsed = customerLoginSchema.safeParse({
      account_email: accountEmail,
      password,
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check your login details.');
      return;
    }

    setIsSubmitting(true);
    const result = await login(parsed.data);
    setIsSubmitting(false);

    if (result.error || !result.data) {
      setError('Invalid email or password.');
      return;
    }

    await applySession(result.data.access_token, result.data.refresh_token);
    navigate('/portal', { replace: true });
  };

  const handleGoogleSignIn = async () => {
    console.log('1. Google button clicked');
    setError(null);
    try {
      const result = await signInWithGoogle();
      console.log('2. signInWithGoogle result:', result);
      if (result.error) {
        console.log('3. Error path taken:', result.error);
        setError('Could not continue with Google.');
        return;
      }
      console.log('4. About to navigate to /auth/callback');
      navigate('/auth/callback', { replace: true });
      console.log('5. Navigate called successfully');
    } catch (err) {
      console.error('CAUGHT ERROR:', err);
    }
  };

  const handleFacebookSignIn = async () => {
    setError(null);
    const result = await signInWithFacebook();
    if (result.error) {
      setError('Could not continue with Facebook.');
      return;
    }
    navigate('/auth/callback', { replace: true });
  };

  return (
    <>
      <form onSubmit={(event) => void handleSubmit(event)}>
        <label>
          <span>Email</span>
          <input
            autoComplete="email"
            type="email"
            value={accountEmail}
            onChange={(event) => setAccountEmail(event.target.value)}
          />
        </label>
        <label>
          <span>Password</span>
          <input
            autoComplete="current-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error ? <p role="alert">{error}</p> : null}
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Signing in' : 'Sign in'}
        </button>
      </form>

      <div>
        <button type="button" onClick={() => void handleGoogleSignIn()}>
          Continue with Google
        </button>
        <button type="button" onClick={() => void handleFacebookSignIn()}>
          Continue with Facebook
        </button>
      </div>
    </>
  );
}
