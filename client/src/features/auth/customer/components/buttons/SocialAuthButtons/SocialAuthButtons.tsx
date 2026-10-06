import { GoogleOAuthButton } from '../GoogleOAuthButton/GoogleOAuthButton';

interface SocialAuthButtonsProps {
  googleClassName?: string;
  dividerClassName?: string;
  buttonRowClassName?: string;
}

export function SocialAuthButtons({
  googleClassName,
  dividerClassName,
  buttonRowClassName,
}: SocialAuthButtonsProps) {
  return (
    <div>
      <div className={dividerClassName}>or continue with</div>
      <div className={buttonRowClassName}>
        <GoogleOAuthButton className={googleClassName} />
      </div>
    </div>
  );
}
