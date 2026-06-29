import { useState, type FormEvent } from 'react';

interface MfaChallengeFormProps {
  onSubmit: (code: string) => Promise<void>;
  error: string | null;
  success: boolean;
}

export function MfaChallengeForm({
  onSubmit,
  error,
  success,
}: MfaChallengeFormProps) {
  const [code, setCode] = useState('');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSubmit(code);
  };

  return (
    <form onSubmit={handleSubmit}>
      <h1>Verify MFA</h1>
      <label htmlFor="staff-mfa-code">Enter your 6-digit code</label>
      <input
        id="staff-mfa-code"
        value={code}
        onChange={(event) => setCode(event.target.value)}
      />
      <button type="submit">Continue</button>
      {error ? <p role="alert">{error}</p> : null}
      {success ? <p>Access granted.</p> : null}
    </form>
  );
}
