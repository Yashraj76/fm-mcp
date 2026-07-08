# Supabase Auth Email Branding Checklist

By default, Supabase sends auth emails with Supabase branding (sender address, logo, footer). This guide walks through branding them for kilink / kibizsystems before going to production.

---

## Checklist

### 1. Custom SMTP (required for production)

Supabase's built-in SMTP has strict rate limits and will show Supabase as the sender.

- [ ] Go to **Supabase Dashboard → Project Settings → Auth → SMTP Settings**
- [ ] Enable **Custom SMTP**
- [ ] Enter your SMTP credentials (e.g. Postmark, Resend, SendGrid, AWS SES)
- [ ] Set **Sender name**: `kilink by kibizsystems`
- [ ] Set **Sender email**: `noreply@kibizsystems.com` (or a subdomain you own)
- [ ] Send a test email to verify delivery

### 2. Email templates

In **Supabase Dashboard → Auth → Email Templates**, customise each template:

| Template | Subject line suggestion |
|----------|------------------------|
| Confirm signup | `Confirm your kilink account` |
| Magic link | `Your kilink sign-in link` |
| Reset password | `Reset your kilink password` |
| Email change | `Confirm your new kilink email address` |
| Invite user | `You've been invited to kilink` |

**Template variables available:**

```
{{ .ConfirmationURL }}   — the action link
{{ .Email }}             — the user's email address
{{ .SiteURL }}           — your configured site URL
```

**Minimum branded template (example — Confirm signup):**

```html
<p>Welcome to <strong>kilink by kibizsystems</strong>.</p>
<p>Click the button below to confirm your account:</p>
<p>
  <a href="{{ .ConfirmationURL }}"
     style="background:#0f172a;color:#fff;padding:10px 20px;border-radius:4px;text-decoration:none">
    Confirm Account
  </a>
</p>
<p>This link expires in 24 hours. If you did not create a kilink account, you can ignore this email.</p>
<hr>
<p style="font-size:12px;color:#64748b">kibizsystems · <a href="https://kilink.kibizsystems.com/legal/privacy">Privacy Policy</a> · <a href="https://kilink.kibizsystems.com/legal/terms">Terms of Service</a></p>
```

### 3. Redirect URLs

- [ ] In **Supabase Dashboard → Auth → URL Configuration**, set **Site URL** to your production domain (e.g. `https://kilink.kibizsystems.com`)
- [ ] Add all redirect URLs you use (e.g. `https://kilink.kibizsystems.com/auth/callback`)
- [ ] Remove `http://localhost:3000` from production redirect URLs

### 4. Auth settings

- [ ] **Supabase Dashboard → Auth → Settings**
  - [ ] Enable **Email Confirmations** (require users to confirm email before login)
  - [ ] Set **Password minimum length** ≥ 8 characters
  - [ ] Set **Token expiry** for magic links and password resets (default 3600s / 1h is reasonable)
  - [ ] Disable **Sign in with email + password** if you only want magic link or OAuth (optional)

### 5. Custom domain for Supabase (optional)

For white-labelling, configure a custom domain for the Supabase Auth endpoint so auth redirects don't show `*.supabase.co`:

- **Supabase Dashboard → Project Settings → Custom Domains**
- Requires a Pro plan or above

### 6. Test the full flow

- [ ] Sign up with a real email — confirm the email arrives with kilink branding
- [ ] Click the confirmation link — confirm it redirects to your domain, not Supabase
- [ ] Test password reset — confirm email arrives and link works
- [ ] Check spam score of outgoing emails (use [mail-tester.com](https://www.mail-tester.com))

---

## DKIM / SPF for your sender domain

If you use a custom sender email, configure DNS records to avoid spam filters:

- **SPF**: Add a TXT record allowing your SMTP provider to send as your domain
- **DKIM**: Add the DKIM public key TXT record provided by your SMTP provider
- **DMARC**: Add a DMARC policy (`p=quarantine` or `p=reject`) to protect your sender domain

Your SMTP provider's documentation will give you the exact DNS records to add.
