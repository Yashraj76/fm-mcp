import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Create Account | kilink',
  description: 'Create a new kilink account.',
};

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
