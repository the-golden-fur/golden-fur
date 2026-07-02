import { useNavigate } from 'react-router';
import { signInWithFacebook } from '../../../api/customerAuth.api';

interface FacebookOAuthButtonProps {
  className?: string;
}

export function FacebookOAuthButton({ className }: FacebookOAuthButtonProps) {
  const navigate = useNavigate();

  const handleClick = async () => {
    const result = await signInWithFacebook();
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
      Continue with Facebook
    </button>
  );
}
