import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign In | kilink',
  description: 'Sign in to your kilink account.',
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
