import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy — kilink by kibizsystems',
  description: 'Privacy Policy for kilink by kibizsystems',
}

export default function PrivacyPage() {
  return (
    <article className="prose prose-invert max-w-none">
      <div className="mb-8 rounded-md border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-400">
        <strong>Legal review pending.</strong> This document is a placeholder and has not been reviewed by legal counsel. Do not rely on it. Replace with a legally-reviewed Privacy Policy before public launch.
      </div>

      <h1 className="text-2xl font-bold mb-2">Privacy Policy</h1>
      <p className="text-muted-foreground text-sm mb-8">
        kilink by kibizsystems &nbsp;·&nbsp; Last updated: [DATE PENDING LEGAL REVIEW]
      </p>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">1. Information We Collect</h2>
        <p className="text-muted-foreground mb-3">We collect the following categories of information:</p>
        <ul className="text-muted-foreground list-disc pl-6 space-y-2">
          <li><strong>Account information:</strong> Email address and authentication credentials via Supabase Auth.</li>
          <li><strong>Configuration data:</strong> MCP server definitions, tool configurations, and FileMaker connection settings you create within the Service.</li>
          <li><strong>Credentials:</strong> FileMaker usernames, passwords, and API keys, stored AES-256-CBC encrypted. We do not transmit or log raw credentials.</li>
          <li><strong>Usage data:</strong> Tool execution logs, error logs, and activity records for operational purposes.</li>
          <li><strong>Technical data:</strong> IP addresses, request metadata, and structured application logs (via pino) for security and monitoring.</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">2. How We Use Information</h2>
        <ul className="text-muted-foreground list-disc pl-6 space-y-2">
          <li>To provide, operate, and maintain the Service</li>
          <li>To authenticate users and enforce access controls</li>
          <li>To execute FileMaker operations you configure via the MCP protocol</li>
          <li>To detect and prevent abuse, fraud, and security incidents</li>
          <li>To send transactional emails (account confirmation, password reset)</li>
          <li>To comply with legal obligations</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">3. Data Storage and Security</h2>
        <p className="text-muted-foreground">
          Your data is stored in a PostgreSQL database hosted on Supabase. All credentials are encrypted at rest using AES-256-CBC. All data in transit is protected by TLS. We implement rate limiting, bcrypt hashing for API keys, and access scoping so that each user can only access their own data.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">4. Data Sharing</h2>
        <p className="text-muted-foreground">
          We do not sell your personal data. We share data only with:
        </p>
        <ul className="text-muted-foreground list-disc pl-6 space-y-2 mt-2">
          <li><strong>Supabase:</strong> Authentication and database hosting</li>
          <li><strong>AI providers (Anthropic, OpenAI, Google):</strong> Only the schema metadata you send for AI tool generation — never raw FileMaker credentials or record data</li>
          <li><strong>Law enforcement:</strong> When required by applicable law</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">5. Data Retention</h2>
        <p className="text-muted-foreground">
          We retain your account and configuration data for as long as your account is active. Tool execution logs are retained for [RETENTION PERIOD — PENDING LEGAL REVIEW]. You may request deletion of your account and associated data by contacting us.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">6. Your Rights</h2>
        <p className="text-muted-foreground">
          Depending on your jurisdiction, you may have rights to access, correct, delete, or export your personal data, or to object to or restrict certain processing. To exercise these rights, contact us at the address below.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">7. Cookies</h2>
        <p className="text-muted-foreground">
          We use session cookies set by Supabase Auth to maintain your authenticated session. No third-party advertising or tracking cookies are used.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">8. Children&apos;s Privacy</h2>
        <p className="text-muted-foreground">
          The Service is not directed to children under 16. We do not knowingly collect personal data from children.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">9. Changes to This Policy</h2>
        <p className="text-muted-foreground">
          We may update this Privacy Policy from time to time. We will notify registered users of material changes by email or via the Service. Continued use of the Service after changes constitutes acceptance of the revised policy.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">10. Contact</h2>
        <p className="text-muted-foreground">
          Privacy-related requests and questions: <a href="mailto:privacy@kibizsystems.com" className="text-foreground underline">privacy@kibizsystems.com</a>
        </p>
      </section>
    </article>
  )
}
