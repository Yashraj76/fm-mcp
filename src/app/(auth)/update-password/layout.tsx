import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Update Password | kilink',
  description: 'Update your kilink account password.',
};

export default function UpdatePasswordLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
