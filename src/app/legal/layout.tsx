import Link from 'next/link'
import { PRODUCT_FULL_NAME } from '@/lib/brand'

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <Link href="/" className="text-sm font-semibold text-foreground hover:text-foreground/80">
          {PRODUCT_FULL_NAME}
        </Link>
        <nav className="flex gap-4 text-sm text-muted-foreground">
          <Link href="/legal/terms" className="hover:text-foreground">Terms of Service</Link>
          <Link href="/legal/privacy" className="hover:text-foreground">Privacy Policy</Link>
        </nav>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-12">
        {children}
      </main>
      <footer className="border-t border-border px-6 py-6 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} kibizsystems. All rights reserved.
      </footer>
    </div>
  )
}
