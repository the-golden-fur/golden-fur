import { signInWithGoogle } from '../../../api/customerAuth.api';

interface GoogleOAuthButtonProps {
  className?: string;
}

export function GoogleOAuthButton({ className }: GoogleOAuthButtonProps) {
  const handleClick = async () => {
    const result = await signInWithGoogle();
    if (result.error) {
      console.error('Google OAuth failed:', result.error);
    }
  };

  return (
    <button
      className={className}
      type="button"
      onClick={() => void handleClick()}
    >
      Continue with Google
    </button>
  );
}
