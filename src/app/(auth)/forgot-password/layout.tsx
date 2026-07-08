import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Reset Password | kilink',
  description: 'Reset your kilink account password.',
};

export default function ForgotPasswordLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
