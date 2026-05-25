import { useState } from 'react';
import type { FormEvent } from 'react';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Globe, KeyRound, Moon, Sun, UserRound } from 'lucide-react';
import { dicts, type Language } from '../i18n';

type LoginPageProps = {
  lang: Language;
  theme: 'dark' | 'light';
  isSubmitting: boolean;
  errorMessage: string | null;
  onToggleLang: () => void;
  onToggleTheme: () => void;
  onSubmit: (credentials: { username: string; password: string }) => Promise<void> | void;
};

export const LoginPage = ({
  lang,
  theme,
  isSubmitting,
  errorMessage,
  onToggleLang,
  onToggleTheme,
  onSubmit,
}: LoginPageProps) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const t = dicts[lang];

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!username.trim() || !password.trim() || isSubmitting) {
      return;
    }

    await onSubmit({
      username: username.trim(),
      password,
    });
  };

  return (
    <div className={`app-shell min-h-screen text-slate-100 ${theme === 'light' ? 'theme-light' : 'theme-dark'}`}>
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <motion.div
          className="absolute top-0 left-0 h-[36rem] w-[36rem] rounded-full bg-blue-500/35 blur-[145px]"
          animate={{
            x: ['-24vw', '42vw', '-38vw', '28vw', '-16vw', '50vw', '-24vw'],
            y: ['-32vh', '-6vh', '36vh', '-26vh', '18vh', '-10vh', '-32vh'],
            scale: [1, 1.28, 0.82, 1.2, 0.9, 1.14, 1],
            rotate: [0, 20, -14, 17, -9, 8, 0],
          }}
          transition={{ duration: 14.5, repeat: Infinity, ease: 'linear', times: [0, 0.14, 0.28, 0.47, 0.63, 0.84, 1] }}
        />
        <motion.div
          className="absolute top-0 right-0 h-[30rem] w-[30rem] rounded-full bg-cyan-400/32 blur-[130px]"
          animate={{
            x: ['20vw', '-48vw', '12vw', '-56vw', '30vw', '-24vw', '20vw'],
            y: ['-18vh', '30vh', '-42vh', '20vh', '-12vh', '42vh', '-18vh'],
            scale: [1, 0.78, 1.24, 0.86, 1.16, 0.9, 1],
            rotate: [0, -18, 12, -16, 9, -7, 0],
          }}
          transition={{ duration: 12.8, repeat: Infinity, ease: 'linear', times: [0, 0.18, 0.33, 0.51, 0.68, 0.87, 1] }}
        />
        <motion.div
          className="absolute bottom-0 left-0 h-[32rem] w-[32rem] rounded-full bg-indigo-500/30 blur-[140px]"
          animate={{
            x: ['-8vw', '56vw', '-30vw', '46vw', '-20vw', '34vw', '-8vw'],
            y: ['24vh', '-44vh', '10vh', '-30vh', '38vh', '-16vh', '24vh'],
            scale: [1, 1.3, 0.8, 1.16, 0.88, 1.08, 1],
            rotate: [0, 15, -11, 13, -8, 7, 0],
          }}
          transition={{ duration: 15.7, repeat: Infinity, ease: 'linear', times: [0, 0.12, 0.29, 0.46, 0.64, 0.83, 1] }}
        />
        <motion.div
          className="absolute top-1/2 left-1/2 h-[22rem] w-[22rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-300/22 blur-[120px]"
          animate={{
            x: ['0vw', '-36vw', '24vw', '-42vw', '12vw', '-18vw', '0vw'],
            y: ['0vh', '34vh', '-26vh', '18vh', '-36vh', '22vh', '0vh'],
            scale: [1, 1.2, 0.84, 1.12, 0.9, 1.06, 1],
          }}
          transition={{ duration: 11.2, repeat: Infinity, ease: 'linear', times: [0, 0.16, 0.31, 0.49, 0.69, 0.86, 1] }}
        />
      </div>

      <div className="relative z-10 mx-auto flex min-h-[100dvh] w-full items-center justify-center px-3 py-4 sm:px-5 sm:py-8">
        <section className="glass-panel w-full max-w-[27.5rem] rounded-3xl border border-slate-700/40 p-5 sm:p-7 md:p-8">
          <div className="mb-7 flex items-center justify-between gap-3 sm:mb-8">
            <div className="flex items-center gap-3">
              <img
                src="/smartroute-logo.svg"
                alt={t.smartRouteLogoAlt}
                className="h-9 w-9 rounded-xl shadow-lg shadow-blue-500/30 sm:h-10 sm:w-10"
              />
              <p className="brand-title text-base font-bold uppercase tracking-wide sm:text-lg">SmartRoute</p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onToggleLang}
                className="login-toolbar-toggle flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/45 px-2.5 py-2 text-xs font-medium text-slate-300 hover:border-blue-500/50 sm:px-3 sm:text-sm"
              >
                <Globe size={16} className="text-blue-400" />
                <span className="uppercase">{lang}</span>
              </button>
              <button
                type="button"
                onClick={onToggleTheme}
                className="login-toolbar-toggle flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/45 px-2.5 py-2 text-xs font-medium text-slate-300 hover:border-blue-500/50 sm:px-3 sm:text-sm"
              >
                {theme === 'dark' ? <Moon size={16} className="text-indigo-300" /> : <Sun size={16} className="text-amber-400" />}
                <span className="max-[380px]:hidden">{theme === 'dark' ? t.themeNight : t.themeDay}</span>
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="mt-1 space-y-5 sm:space-y-6">
            <label className="block">
              <span className="mb-2 block text-xs uppercase tracking-[0.16em] text-slate-500">{t.loginLabel}</span>
              <div className="flex items-center gap-3 rounded-xl border border-slate-700/60 bg-slate-900/40 px-3 py-3 sm:px-4 sm:py-3.5 focus-within:border-blue-500/60">
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

            <label className="block">
              <span className="mb-2 block text-xs uppercase tracking-[0.16em] text-slate-500">{t.passwordLabel}</span>
              <div className="flex items-center gap-3 rounded-xl border border-slate-700/60 bg-slate-900/40 px-3 py-3 sm:px-4 sm:py-3.5 focus-within:border-blue-500/60">
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

            {errorMessage ? (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {errorMessage}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="login-submit-btn mt-2 w-full rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 transition-all disabled:cursor-not-allowed disabled:opacity-70 sm:py-3.5"
            >
              {isSubmitting ? t.signingIn : t.signIn}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
};
