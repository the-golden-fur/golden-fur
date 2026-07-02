import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../../../providers/AuthProvider/useAuth';
import { signup } from '../../../api/customerAuth.api';
import { customerSignupSchema } from '../../../modules/validators/customerAuth.validator';

export function CustomerSignupForm() {
  const navigate = useNavigate();
  const { applySession } = useAuth();
  const [fullName, setFullName] = useState('');
  const [accountEmail, setAccountEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const parsed = customerSignupSchema.safeParse({
      full_name: fullName,
      account_email: accountEmail,
      password,
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check your details.');
      return;
    }

    setIsSubmitting(true);
    const result = await signup(parsed.data);
    setIsSubmitting(false);

    if (result.error || !result.data) {
      setError('Unable to create account.');
      return;
    }

    await applySession('demo-access-token', 'demo-refresh-token');
    navigate('/portal', { replace: true });
  };

  return (
    <form onSubmit={(event) => void handleSubmit(event)}>
      <label>
        <span>Full name</span>
        <input
          autoComplete="name"
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
        />
      </label>
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
          autoComplete="new-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      {error ? <p role="alert">{error}</p> : null}
      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Creating account' : 'Create account'}
      </button>
    </form>
  );
}
