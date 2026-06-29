import { useState, type FormEvent } from 'react';

interface MfaEnrollFormProps {
  qrCodeUri: string;
  onVerify: (code: string) => Promise<void>;
  message: string | null;
}

export function MfaEnrollForm({
  qrCodeUri,
  onVerify,
  message,
}: MfaEnrollFormProps) {
  const [code, setCode] = useState('');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onVerify(code);
  };

  return (
    <form onSubmit={handleSubmit}>
      <h1>Enroll MFA</h1>
      {qrCodeUri ? <img src={qrCodeUri} alt="MFA QR code" /> : null}
      <label htmlFor="mfa-code">Verification code</label>
      <input
        id="mfa-code"
        value={code}
        onChange={(event) => setCode(event.target.value)}
      />
      <button type="submit">Verify</button>
      {message ? <p>{message}</p> : null}
    </form>
  );
}
