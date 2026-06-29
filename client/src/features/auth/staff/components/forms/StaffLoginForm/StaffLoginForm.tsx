import { useState, type FormEvent } from 'react';
import styles from './StaffLoginForm.module.css';

interface StaffLoginFormProps {
  onSubmit: (username: string, password: string) => Promise<void>;
  onForgotPassword: (username: string) => Promise<void>;
  error: string | null;
  confirmation: string | null;
}

export function StaffLoginForm({
  onSubmit,
  onForgotPassword,
  error,
  confirmation,
}: StaffLoginFormProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSubmit(username, password);
  };

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      <h1>Staff Login</h1>
      <label htmlFor="staff-username">Username</label>
      <input
        id="staff-username"
        value={username}
        onChange={(event) => setUsername(event.target.value)}
      />
      <label htmlFor="staff-password">Password</label>
      <input
        id="staff-password"
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />
      <button type="submit" className={styles.buttonPrimary}>Sign In</button>
      <button
        type="button"
        onClick={() => {
          void onForgotPassword(username);
        }}
      >
        Forgot Password
      </button>
      {error ? <p role="alert">{error}</p> : null}
      {confirmation ? <p>{confirmation}</p> : null}
    </form>
  );
}
