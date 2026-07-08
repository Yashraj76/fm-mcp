import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms of Service — kilink by kibizsystems',
  description: 'Terms of Service for kilink by kibizsystems',
}

export default function TermsPage() {
  return (
    <article className="prose prose-invert max-w-none">
      <div className="mb-8 rounded-md border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-400">
        <strong>Legal review pending.</strong> This document is a placeholder and has not been reviewed by legal counsel. Do not rely on it. Replace with a legally-reviewed Terms of Service before public launch.
      </div>

      <h1 className="text-2xl font-bold mb-2">Terms of Service</h1>
      <p className="text-muted-foreground text-sm mb-8">
        kilink by kibizsystems &nbsp;·&nbsp; Last updated: [DATE PENDING LEGAL REVIEW]
      </p>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">1. Acceptance of Terms</h2>
        <p className="text-muted-foreground">
          By accessing or using kilink (&quot;the Service&quot;), you agree to be bound by these Terms of Service (&quot;Terms&quot;) and our Privacy Policy. If you do not agree, do not use the Service.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">2. Description of Service</h2>
        <p className="text-muted-foreground">
          kilink is a platform for building, managing, and testing FileMaker MCP servers and tools, provided by kibizsystems (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;).
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">3. Account Registration</h2>
        <p className="text-muted-foreground">
          You must create an account to use the Service. You are responsible for maintaining the confidentiality of your credentials and for all activity under your account. You must notify us immediately of any unauthorized account use.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">4. Acceptable Use</h2>
        <p className="text-muted-foreground">
          You agree not to use the Service to: (a) violate any applicable law or regulation; (b) infringe any intellectual property rights; (c) transmit malware or conduct unauthorized access attempts; (d) interfere with the integrity or performance of the Service.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">5. Data and Credentials</h2>
        <p className="text-muted-foreground">
          You retain ownership of your FileMaker database credentials and data. We store credentials encrypted at rest and do not access them except as required to execute the operations you configure. See our Privacy Policy for details.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">6. Intellectual Property</h2>
        <p className="text-muted-foreground">
          The Service and its original content, features, and functionality are owned by kibizsystems and are protected by applicable intellectual property laws. Your use of the Service does not transfer any intellectual property rights to you.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">7. Disclaimers and Limitation of Liability</h2>
        <p className="text-muted-foreground">
          THE SERVICE IS PROVIDED &quot;AS IS&quot; WITHOUT WARRANTIES OF ANY KIND. TO THE MAXIMUM EXTENT PERMITTED BY LAW, KIBIZSYSTEMS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING FROM YOUR USE OF THE SERVICE.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">8. Termination</h2>
        <p className="text-muted-foreground">
          We may terminate or suspend your access to the Service at our sole discretion, without prior notice, for conduct that we believe violates these Terms or is harmful to other users, us, or third parties.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">9. Changes to Terms</h2>
        <p className="text-muted-foreground">
          We reserve the right to modify these Terms at any time. We will notify registered users of material changes. Continued use of the Service after changes constitutes acceptance of the revised Terms.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">10. Contact</h2>
        <p className="text-muted-foreground">
          Questions about these Terms should be directed to: <a href="mailto:legal@kibizsystems.com" className="text-foreground underline">legal@kibizsystems.com</a>
        </p>
      </section>
    </article>
  )
}
