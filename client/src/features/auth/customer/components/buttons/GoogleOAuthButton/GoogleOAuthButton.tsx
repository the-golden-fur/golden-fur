import { useNavigate } from 'react-router';
import { signInWithGoogle } from '../../../api/customerAuth.api';

interface GoogleOAuthButtonProps {
  className?: string;
}

export function GoogleOAuthButton({ className }: GoogleOAuthButtonProps) {
  const navigate = useNavigate();

  const handleClick = async () => {
    const result = await signInWithGoogle();
    if (!result.error) {
      navigate('/auth/callback', { replace: true });
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
