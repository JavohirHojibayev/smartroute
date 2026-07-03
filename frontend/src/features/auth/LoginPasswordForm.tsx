import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, KeyRound, UserRound } from 'lucide-react';
import type { Language } from '../../i18n';
import { dicts } from '../../i18n';

type LoginPasswordFormProps = {
  lang: Language;
  isSubmitting: boolean;
  onSubmit: (credentials: { username: string; password: string }) => Promise<void> | void;
};

export const LoginPasswordForm = ({ lang, isSubmitting, onSubmit }: LoginPasswordFormProps) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const t = dicts[lang];

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!username.trim() || !password.trim() || isSubmitting) return;
    await onSubmit({ username: username.trim(), password });
  };

  return (
    <form onSubmit={handleSubmit} className="mt-1 space-y-5 sm:space-y-6">
      <label className="block login-input-label">
        <span className="mb-2 block text-xs uppercase tracking-[0.16em] text-slate-500">{t.loginLabel}</span>
        <div className="login-input-container flex items-center gap-3 rounded-xl border border-slate-700/60 bg-slate-900/40 px-3 py-3 sm:px-4 sm:py-3.5 focus-within:border-blue-500/60">
          <UserRound size={18} className="text-slate-400" />
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            className="login-auth-input w-full bg-transparent text-[14px] text-slate-100 outline-none placeholder:text-slate-500 sm:text-sm"
            placeholder={t.loginPlaceholder}
            required
          />
        </div>
      </label>

      <label className="block login-input-label">
        <span className="mb-2 block text-xs uppercase tracking-[0.16em] text-slate-500">{t.passwordLabel}</span>
        <div className="login-input-container flex items-center gap-3 rounded-xl border border-slate-700/60 bg-slate-900/40 px-3 py-3 sm:px-4 sm:py-3.5 focus-within:border-blue-500/60">
          <KeyRound size={18} className="text-slate-400" />
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            className="login-auth-input w-full bg-transparent text-[14px] text-slate-100 outline-none placeholder:text-slate-500 sm:text-sm"
            placeholder={t.passwordPlaceholder}
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            className="rounded-lg p-1 text-slate-400 transition-colors hover:text-slate-200"
            aria-label={showPassword ? t.hidePassword : t.showPassword}
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </label>

      <button
        type="submit"
        disabled={isSubmitting}
        className="login-submit-btn mt-2 w-full rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 transition-all disabled:cursor-not-allowed disabled:opacity-70 sm:py-3.5"
      >
        {isSubmitting ? t.signingIn : t.signIn}
      </button>
    </form>
  );
};
