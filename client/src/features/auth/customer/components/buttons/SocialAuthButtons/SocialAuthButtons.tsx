import { FacebookOAuthButton } from '../FacebookOAuthButton/FacebookOAuthButton';
import { GoogleOAuthButton } from '../GoogleOAuthButton/GoogleOAuthButton';

interface SocialAuthButtonsProps {
  googleClassName?: string;
  facebookClassName?: string;
  dividerClassName?: string;
  buttonRowClassName?: string;
}

export function SocialAuthButtons({
  googleClassName,
  facebookClassName,
  dividerClassName,
  buttonRowClassName,
}: SocialAuthButtonsProps) {
  return (
    <div>
      <div className={dividerClassName}>or continue with</div>
      <div className={buttonRowClassName}>
        <GoogleOAuthButton className={googleClassName} />
        <FacebookOAuthButton className={facebookClassName} />
      </div>
    </div>
  );
}
