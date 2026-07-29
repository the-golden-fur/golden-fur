import { AuthCard } from '../../../../../shared/components/AuthCard/AuthCard';
import { StaffResetPasswordForm } from '../../components/forms/StaffResetPasswordForm/StaffResetPasswordForm';

export function StaffResetPasswordPage() {
  return (
    <AuthCard
      titleId="staff-reset-title"
      title="Reset your password"
      subtitle="Choose a new password to sign back in."
    >
      <StaffResetPasswordForm />
    </AuthCard>
  );
}
