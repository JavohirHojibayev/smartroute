import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Globe, Moon, Sun } from 'lucide-react';
import { dicts, type Language } from '../i18n';
import { AuthModeSwitcher, type AuthMode } from '../features/auth/AuthModeSwitcher';
import { EimzoLoginForm } from '../features/auth/EimzoLoginForm';
import { LoginPasswordForm } from '../features/auth/LoginPasswordForm';
import { getEimzoLocalhostUrl, isEimzoApiKeyErrorMessage } from '../features/auth/eimzo/eimzo.service';
import type { EimzoLoginResponse } from '../features/auth/eimzo/eimzo.types';

type LoginPageProps = {
  lang: Language;
  theme: 'dark' | 'light';
  isSubmitting: boolean;
  errorMessage: string | null;
  onToggleLang: () => void;
  onToggleTheme: () => void;
  onSubmit: (credentials: { username: string; password: string }) => Promise<void> | void;
  onEimzoLogin: (payload: EimzoLoginResponse) => Promise<void> | void;
};

export const LoginPage = ({
  lang,
  theme,
  isSubmitting,
  errorMessage,
  onToggleLang,
  onToggleTheme,
  onSubmit,
  onEimzoLogin,
}: LoginPageProps) => {
  const [mode, setMode] = useState<AuthMode>('password');
  const [eimzoSubmitting, setEimzoSubmitting] = useState(false);
  const [eimzoError, setEimzoError] = useState<string | null>(null);
  const t = dicts[lang];
  const activeError = mode === 'eimzo' ? eimzoError : errorMessage;

  useEffect(() => {
    if (mode !== 'eimzo' || !eimzoError) return;
    const timeout = window.setTimeout(() => setEimzoError(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [eimzoError, mode]);

  return (
    <div className={`app-shell min-h-screen text-slate-100 ${theme === 'light' ? 'theme-light' : 'theme-dark'} login-page`}>
      <div className="absolute inset-0 pointer-events-none overflow-hidden login-blobs">
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
        <section className="glass-panel login-glass-panel w-full max-w-[27.5rem] rounded-3xl border border-slate-700/40 p-5 sm:p-7 md:p-8">
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

          <AuthModeSwitcher lang={lang} mode={mode} onChange={(nextMode) => {
            setMode(nextMode);
            setEimzoError(null);
          }} />

          {activeError ? (
            <div className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {activeError}
              {mode === 'eimzo' && isEimzoApiKeyErrorMessage(activeError) ? (
                <a
                  href={getEimzoLocalhostUrl()}
                  className="mt-3 inline-flex w-full items-center justify-center rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-100 hover:bg-red-500/20"
                >
                  {t.eimzoOpenLocalhost}
                </a>
              ) : null}
            </div>
          ) : null}

          {mode === 'password' ? (
            <LoginPasswordForm lang={lang} isSubmitting={isSubmitting} onSubmit={onSubmit} />
          ) : (
            <EimzoLoginForm
              lang={lang}
              isSubmitting={eimzoSubmitting}
              onSubmittingChange={setEimzoSubmitting}
              onLogin={onEimzoLogin}
              onError={setEimzoError}
            />
          )}
        </section>
      </div>
    </div>
  );
};
