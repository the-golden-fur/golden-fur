import { signInWithFacebook } from '../../../api/customerAuth.api';

interface FacebookOAuthButtonProps {
  className?: string;
}

export function FacebookOAuthButton({ className }: FacebookOAuthButtonProps) {
  const handleClick = async () => {
    const result = await signInWithFacebook();
    if (result.error) {
      console.error('Facebook OAuth failed:', result.error);
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
