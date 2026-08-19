/* eslint-disable react-hooks/set-state-in-effect */
'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    // Read error from URL if present
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const urlError = urlParams.get('error');
      if (urlError === 'confirmation_failed') {
        setError('Email confirmation failed or link expired. Please try again.');
      }
    }
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setLoading(false);
      setError(
        error.message === 'Email not confirmed'
          ? 'Please check your email and confirm your account before signing in.'
          : error.message
      );
    } else {
      // Refresh server components after login
      router.push('/');
      router.refresh();
    }
  }



  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md p-8 space-y-6 bg-card border border-border rounded-xl shadow-lg">
        
        <div className="text-center space-y-2">
          <div className="w-10 h-10 rounded-lg overflow-hidden mx-auto">
            <img src="/logo.svg" alt="kilink" className="w-10 h-10" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Sign in to kilink</h1>
          <p className="text-sm text-muted-foreground">FileMaker MCP server builder by kibizsystems</p>
        </div>

        {error && (
          <div role="alert" aria-live="assertive" className="p-3 rounded-md text-sm bg-red-500/10 text-red-400 border border-red-500/20">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-foreground mb-1">
              Email address
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="w-full px-3 py-2 bg-input border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="password" className="block text-sm font-medium text-foreground">
                Password
              </label>
              <Link href="/forgot-password" className="text-sm font-medium text-primary hover:underline">
                Forgot password?
              </Link>
            </div>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter your password"
              className="w-full px-3 py-2 bg-input border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 bg-primary text-primary-foreground font-medium rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-sm transition-colors"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          No account yet?{' '}
          <Link href="/signup" className="text-primary hover:underline font-medium">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
