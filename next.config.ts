import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// The browser talks to Supabase directly (auth + session refresh) — allow that
// origin explicitly instead of a blanket https:. Derived at build/server start.
const supabaseOrigin = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
      : "";
  } catch {
    return "";
  }
})();
const supabaseWsOrigin = supabaseOrigin.replace(/^http/, "ws");

// Baseline CSP. 'unsafe-inline' for scripts/styles is required by Next.js
// hydration inline scripts and Tailwind/inline style attributes (no nonce
// infrastructure in this app); 'unsafe-eval' is dev-only (React Refresh).
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseOrigin} ${supabaseWsOrigin}`.trim().replace(/\s+/g, " "),
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
