import { useEffect, useState } from 'react';
import { mfaEnroll, mfaVerify } from '../../api/staffAuth.api';
import { MfaEnrollForm } from '../../components/forms/MfaEnrollForm/MfaEnrollForm';

export function MfaEnrollPage() {
  const [qrCodeUri, setQrCodeUri] = useState<string>('');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const result = await mfaEnroll();
      if (result.data?.qrCodeUri) {
        setQrCodeUri(result.data.qrCodeUri);
      }
    })();
  }, []);

  const handleVerify = async (code: string) => {
    const result = await mfaVerify({ code });
    if (result.error) {
      setMessage('Invalid verification code.');
      return;
    }

    setMessage('Enrollment confirmed.');
  };

  return (
    <MfaEnrollForm
      qrCodeUri={qrCodeUri}
      onVerify={handleVerify}
      message={message}
    />
  );
}
