import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { motion } from 'motion/react';
import { ArrowLeft, CheckCircle2, Loader2, LockKeyhole, ShieldCheck, Sparkles } from 'lucide-react';
import BrandLogo from '../components/BrandLogo';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('New password and confirm password must match.');
      return;
    }

    setIsSubmitting(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        setError(updateError.message);
      } else {
        setMessage('Password updated successfully. Redirecting to login...');
        setTimeout(() => navigate('/login'), 1800);
      }
    } catch {
      setError('Unable to reset your password right now. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen px-4 py-6 lg:px-8">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <motion.section initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} className="flex items-center">
          <div className="w-full rounded-[36px] border border-white/70 bg-white p-6 shadow-[0_30px_80px_rgba(15,23,42,0.08)] md:p-8 lg:p-10">
            <div className="flex items-center justify-between gap-4">
              <Link to="/login" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 transition hover:text-rose-600"><ArrowLeft size={16} />Back to login</Link>
              <BrandLogo compact />
            </div>

            <div className="mt-10 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-rose-500">Reset password</p>
              <h2 className="text-3xl font-black text-slate-950">Create a new password</h2>
              <p className="text-sm text-slate-500">Set a fresh password for your fashionNEST account and continue securely.</p>
            </div>

            {error ? <div className="mt-6 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">{error}</div> : null}
            {message ? <div className="mt-6 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{message}</div> : null}

            <form onSubmit={handleSubmit} className="mt-6 space-y-5">
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">New Password</label>
                <input type="password" required className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-rose-500 focus:bg-white" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your new password" />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">Confirm Password</label>
                <input type="password" required className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-rose-500 focus:bg-white" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter your new password" />
              </div>
              <button type="submit" disabled={isSubmitting} className="w-full rounded-full bg-slate-950 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-70">
                <span className="inline-flex items-center gap-2">{isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <LockKeyhole size={16} />}{isSubmitting ? 'Updating password...' : 'Update password'}</span>
              </button>
            </form>
          </div>
        </motion.section>

        <motion.section initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} className="relative overflow-hidden rounded-[36px] bg-slate-950 p-8 text-white shadow-[0_30px_80px_rgba(15,23,42,0.16)] lg:p-10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(244,63,94,0.35),_transparent_36%),radial-gradient(circle_at_bottom_right,_rgba(251,191,36,0.25),_transparent_28%)]" />
          <div className="relative space-y-8">
            <BrandLogo showTagline theme="dark" />
            <div className="space-y-4">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em]"><Sparkles size={14} />Secure recovery</span>
              <h1 className="max-w-xl text-4xl font-black leading-tight">Reset access safely with encrypted password storage.</h1>
              <p className="max-w-xl text-sm leading-7 text-white/75 md:text-base">Your new password is securely hashed and stored by Supabase Auth. The recovery session expires automatically for better account protection.</p>
            </div>
            <div className="rounded-[28px] border border-white/10 bg-white/8 p-5 backdrop-blur-sm">
              <div className="flex items-start gap-4">
                <div className="rounded-2xl bg-white/10 p-3 text-amber-300"><ShieldCheck size={20} /></div>
                <div>
                  <h2 className="text-lg font-bold">Email-based recovery</h2>
                  <p className="mt-1 text-sm text-white/70">The reset link in your email brought you here securely. Set your new password below.</p>
                </div>
              </div>
            </div>
            <div className="rounded-[28px] border border-white/10 bg-white/8 p-5 backdrop-blur-sm">
              <div className="flex items-start gap-4">
                <div className="rounded-2xl bg-white/10 p-3 text-amber-300"><CheckCircle2 size={20} /></div>
                <div>
                  <h2 className="text-lg font-bold">Account ready after reset</h2>
                  <p className="mt-1 text-sm text-white/70">Once updated, you can return to the login page and sign in immediately with your new password.</p>
                </div>
              </div>
            </div>
          </div>
        </motion.section>
      </div>
    </div>
  );
}
