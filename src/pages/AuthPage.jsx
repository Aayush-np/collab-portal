import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Loader2, LogIn, UserPlus } from 'lucide-react';
import './Auth.css';

const GOOGLE_SCRIPT_ID = 'google-identity-script';
const TURNSTILE_SCRIPT_ID = 'cf-turnstile-script';
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';

const loadTurnstileScript = () => new Promise((resolve) => {
  if (window.turnstile) {
    resolve();
    return;
  }
  const existing = document.getElementById(TURNSTILE_SCRIPT_ID);
  if (existing) {
    existing.addEventListener('load', () => resolve(), { once: true });
    return;
  }
  const script = document.createElement('script');
  script.id = TURNSTILE_SCRIPT_ID;
  script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  script.async = true;
  script.defer = true;
  script.addEventListener('load', () => resolve(), { once: true });
  document.head.appendChild(script);
});

const useGoogleAuth = ({ enabled, onCredential }) => {
  useEffect(() => {
    if (!enabled || !window.google) return undefined;

    const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!googleClientId) return undefined;

    window.google.accounts.id.initialize({
      client_id: googleClientId,
      callback: (response) => {
        if (response?.credential) {
          onCredential(response.credential);
        }
      },
    });

    const container = document.getElementById('google-signin-btn');
    if (container) {
      container.innerHTML = '';
      window.google.accounts.id.renderButton(container, {
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'pill',
        width: 280,
      });
    }

    return undefined;
  }, [enabled, onCredential]);

  useEffect(() => {
    if (!enabled || window.google) return undefined;

    if (document.getElementById(GOOGLE_SCRIPT_ID)) return undefined;

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.id = GOOGLE_SCRIPT_ID;
    document.body.appendChild(script);

    return undefined;
  }, [enabled]);
};

export default function AuthPage({ onLogin, onRegister, onGoogleLogin, onForgotPassword, onResetPassword, loading }) {
  const [mode, setMode] = useState('login');
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetForm, setResetForm] = useState({ token: '', password: '' });
  const [info, setInfo] = useState('');
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState({
    login: false,
    register: false,
    registerConfirm: false,
    reset: false,
  });
  const turnstileContainerRef = useRef(null);
  const turnstileWidgetRef = useRef(null);
  const [captchaToken, setCaptchaToken] = useState('');

  // Cloudflare Turnstile: only rendered when VITE_TURNSTILE_SITE_KEY is configured.
  const captchaEnabled = Boolean(TURNSTILE_SITE_KEY);

  useEffect(() => {
    if (!captchaEnabled || mode === 'reset') return undefined;

    let cancelled = false;
    loadTurnstileScript().then(() => {
      if (cancelled || !turnstileContainerRef.current || !window.turnstile) return;
      if (turnstileWidgetRef.current !== null) return;
      turnstileWidgetRef.current = window.turnstile.render(turnstileContainerRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        theme: 'dark',
        callback: (token) => setCaptchaToken(token),
        'expired-callback': () => setCaptchaToken(''),
        'error-callback': () => setCaptchaToken(''),
      });
    });

    return () => {
      cancelled = true;
      if (turnstileWidgetRef.current !== null && window.turnstile) {
        try { window.turnstile.remove(turnstileWidgetRef.current); } catch { /* widget already gone */ }
        turnstileWidgetRef.current = null;
      }
      setCaptchaToken('');
    };
  }, [captchaEnabled, mode]);

  const resetCaptcha = () => {
    setCaptchaToken('');
    if (turnstileWidgetRef.current !== null && window.turnstile) {
      try { window.turnstile.reset(turnstileWidgetRef.current); } catch { /* ignore */ }
    }
  };

  const googleEnabled = import.meta.env.VITE_ENABLE_GOOGLE_AUTH === '1' && Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID);

  useGoogleAuth({
    enabled: googleEnabled,
    onCredential: async (credential) => {
      setError('');
      try {
        await onGoogleLogin(credential);
      } catch (e) {
        setError(e.message || 'Google sign-in failed.');
      }
    },
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const resetToken = params.get('resetToken');
    if (resetToken) {
      setMode('reset');
      setResetForm((prev) => ({ ...prev, token: resetToken }));
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');

    if (captchaEnabled && !captchaToken) {
      setError('Please complete the CAPTCHA check.');
      return;
    }

    try {
      if (mode === 'login') {
        await onLogin({ email: form.email, password: form.password, captchaToken });
      } else {
        if (form.password !== form.confirmPassword) {
          throw new Error('Password and confirm password must match.');
        }
        await onRegister({ ...form, captchaToken });
      }
    } catch (err) {
      setError(err.message || 'Authentication failed.');
      resetCaptcha();
    }
  };

  const handleForgot = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
    if (captchaEnabled && !captchaToken) {
      setError('Please complete the CAPTCHA check.');
      return;
    }
    try {
      const result = await onForgotPassword({ email: forgotEmail, captchaToken });
      if (result?.devResetToken) {
        setInfo(`Reset token (dev only): ${result.devResetToken}`);
      } else {
        setInfo('If this email exists, a reset link has been sent.');
      }
    } catch (err) {
      setError(err.message || 'Could not send reset link.');
      resetCaptcha();
    }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
    try {
      await onResetPassword({ token: resetForm.token, newPassword: resetForm.password });
      setInfo('Password updated. You can sign in now.');
      setMode('login');
    } catch (err) {
      setError(err.message || 'Could not reset password.');
    }
  };

  const currentTitle = mode === 'register'
    ? 'Create Your Account'
    : mode === 'forgot'
      ? 'Reset Password'
      : mode === 'reset'
        ? 'Set New Password'
        : 'Welcome Back';

  return (
    <div className="auth-shell">
      <div className="auth-bg-glow auth-bg-glow-a" />
      <div className="auth-bg-glow auth-bg-glow-b" />

      <div className="auth-card">
        <div className="auth-brand">CollabHub</div>
        <h1>{currentTitle}</h1>
        <p className="auth-sub">Build, discover, and collaborate with the right teammates.</p>

        {(mode === 'login' || mode === 'register') && (
          <div className="auth-mode-switch">
            <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>
              <LogIn size={15} /> Login
            </button>
            <button className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>
              <UserPlus size={15} /> Create Account
            </button>
          </div>
        )}

        {(mode === 'login' || mode === 'register') && (
        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === 'register' && (
            <div className="form-group">
              <label>Full Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Aayush Jaiswal"
                required
              />
            </div>
          )}

          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              placeholder="yourname.dept@cmrit.ac.in"
              required
            />
            <span className="auth-field-hint">Only @cmrit.ac.in email addresses are allowed.</span>
          </div>

          <div className="form-group">
            <label>Password</label>
            <div className="password-input-wrap">
              <input
                type={mode === 'login'
                  ? (showPassword.login ? 'text' : 'password')
                  : (showPassword.register ? 'text' : 'password')}
                value={form.password}
                onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                placeholder="Minimum 6 characters"
                minLength={6}
                required
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowPassword((p) => ({
                  ...p,
                  [mode === 'login' ? 'login' : 'register']: !p[mode === 'login' ? 'login' : 'register'],
                }))}
                aria-label="Toggle password visibility"
              >
                {(mode === 'login' ? showPassword.login : showPassword.register) ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {mode === 'register' && (
            <div className="form-group">
              <label>Confirm Password</label>
              <div className="password-input-wrap">
                <input
                  type={showPassword.registerConfirm ? 'text' : 'password'}
                  value={form.confirmPassword}
                  onChange={(e) => setForm((p) => ({ ...p, confirmPassword: e.target.value }))}
                  placeholder="Retype password"
                  minLength={6}
                  required
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowPassword((p) => ({ ...p, registerConfirm: !p.registerConfirm }))}
                  aria-label="Toggle confirm password visibility"
                >
                  {showPassword.registerConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          )}

          {captchaEnabled && <div className="turnstile-wrap" ref={turnstileContainerRef} />}

          {error && <p className="auth-error">{error}</p>}
          {info && <p className="auth-info">{info}</p>}

          <button className="btn btn-lime auth-submit" type="submit" disabled={loading}>
            {loading ? <Loader2 size={16} className="spin" /> : null}
            {mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>

          {mode === 'login' && (
            <button type="button" className="auth-link-btn" onClick={() => setMode('forgot')}>
              Forgot password?
            </button>
          )}
        </form>
        )}

        {mode === 'forgot' && (
          <form className="auth-form" onSubmit={handleForgot}>
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                placeholder="yourname.dept@cmrit.ac.in"
                required
              />
            </div>

            {captchaEnabled && <div className="turnstile-wrap" ref={turnstileContainerRef} />}

            {error && <p className="auth-error">{error}</p>}
            {info && <p className="auth-info">{info}</p>}

            <button className="btn btn-lime auth-submit" type="submit" disabled={loading}>
              {loading ? <Loader2 size={16} className="spin" /> : null}
              Send Reset Link
            </button>

            <button type="button" className="auth-link-btn" onClick={() => setMode('login')}>
              Back to login
            </button>
          </form>
        )}

        {mode === 'reset' && (
          <form className="auth-form" onSubmit={handleReset}>
            {resetForm.token ? (
              <p className="auth-info">Reset link verified. Choose a new password below.</p>
            ) : (
              <div className="form-group">
                <label>Reset Token</label>
                <input
                  type="password"
                  autoComplete="off"
                  value={resetForm.token}
                  onChange={(e) => setResetForm((p) => ({ ...p, token: e.target.value }))}
                  placeholder="Paste token from email"
                  required
                />
              </div>
            )}

            <div className="form-group">
              <label>New Password</label>
              <div className="password-input-wrap">
                <input
                  type={showPassword.reset ? 'text' : 'password'}
                  minLength={6}
                  value={resetForm.password}
                  onChange={(e) => setResetForm((p) => ({ ...p, password: e.target.value }))}
                  placeholder="Minimum 6 characters"
                  required
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowPassword((p) => ({ ...p, reset: !p.reset }))}
                  aria-label="Toggle new password visibility"
                >
                  {showPassword.reset ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && <p className="auth-error">{error}</p>}
            {info && <p className="auth-info">{info}</p>}

            <button className="btn btn-lime auth-submit" type="submit" disabled={loading}>
              {loading ? <Loader2 size={16} className="spin" /> : null}
              Update Password
            </button>

            <button type="button" className="auth-link-btn" onClick={() => setMode('login')}>
              Back to login
            </button>
          </form>
        )}

        {googleEnabled ? (
          <div id="google-signin-btn" className="google-btn-wrap" />
        ) : null}

      </div>
    </div>
  );
}
