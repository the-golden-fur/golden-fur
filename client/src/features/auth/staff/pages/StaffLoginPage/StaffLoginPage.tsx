import { useState } from 'react';
import { StaffLoginForm } from '../../components/forms/StaffLoginForm/StaffLoginForm';
import { forgotPassword, login } from '../../api/staffAuth.api';
import { staffAuthValidator } from '../../modules/validators/staffAuth.validator';
import styles from './StaffLoginPage.module.css';

export function StaffLoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const handleSubmit = async (username: string, password: string) => {
    const parsed = staffAuthValidator.safeParse({ username, password });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid credentials');
      return;
    }

    const result = await login(parsed.data);

    if (result.error) {
      setError('Invalid username or password');
      return;
    }

    setError(null);
    setConfirmation('Signed in successfully.');
  };

  const handleForgotPassword = async (username: string) => {
    const result = await forgotPassword({ username });

    if (result.error) {
      setError('Unable to send reset email.');
      return;
    }

    setError(null);
    setConfirmation('Password reset email sent.');
  };

  return (
    <main className={styles.page}>
      <StaffLoginForm
        onSubmit={handleSubmit}
        onForgotPassword={handleForgotPassword}
        error={error}
        confirmation={confirmation}
      />
    </main>
  );
}
