import { useEffect, useState } from 'react';
import { Mail, Loader2, CheckCircle, AlertCircle, Send } from 'lucide-react';
import { apiPost } from '../services/api';
import logo from '../img/logo.png';
import './Auth.css';

export default function VerifyEmail() {
  const [status, setStatus] = useState('verifying'); // verifying | pending | success | error
  const [message, setMessage] = useState('');
  const [resendEmail, setResendEmail] = useState('');
  const [resendState, setResendState] = useState('idle'); // idle | sending | sent | error

  useEffect(() => {
    // The token arrives in the URL fragment so it is never sent to servers/logs.
    // Older emails used a query param — support both.
    const fromHash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const fromQuery = new URLSearchParams(window.location.search);
    const token = fromHash.get('token') || fromQuery.get('token');

    if (!token) {
      // Shown right after registering: ask the user to check their inbox.
      setStatus('pending');
      return;
    }

    // Hide the token from the address bar and browser history.
    window.history.replaceState({}, document.title, '/verify-email');

    const verify = async () => {
      try {
        const result = await apiPost('/auth/verify-email', { token });
        if (result.ok) {
          setStatus('success');
          setMessage('Your email has been verified! You can now log in.');
        } else {
          setStatus('error');
          setMessage('Verification failed. The link may have expired — resend a new one below.');
        }
      } catch (err) {
        setStatus('error');
        setMessage(err.message || 'Verification failed. The link may have expired — resend a new one below.');
      }
    };

    verify();
  }, []);

  const handleResend = async (e) => {
    e.preventDefault();
    const email = resendEmail.trim();
    if (!email) return;
    setResendState('sending');
    try {
      await apiPost('/auth/resend-verification', { email });
      setResendState('sent');
    } catch (err) {
      setMessage(err.message || 'Could not resend the verification email.');
      setResendState('error');
    }
  };

  const renderResendForm = () => (
    <form className="auth-form" onSubmit={handleResend}>
      <div className="form-group">
        <label>Didn't get the email? Resend verification link</label>
        <input
          type="email"
          value={resendEmail}
          onChange={(e) => setResendEmail(e.target.value)}
          placeholder="yourname.dept@cmrit.ac.in"
          required
        />
      </div>
      <button className="btn btn-lime auth-submit" type="submit" disabled={resendState === 'sending'}>
        {resendState === 'sending' ? <Loader2 size={16} className="spin" /> : <Send size={16} />}
        Resend Link
      </button>
      {resendState === 'sent' && (
        <p className="auth-info">If that account needs verification, a new link is on its way. Check your inbox (and spam).</p>
      )}
      {resendState === 'error' && <p className="auth-error">{message || 'Could not resend email.'}</p>}
    </form>
  );

  if (status === 'verifying') {
    return (
      <div className="auth-shell">
        <div className="auth-bg-glow auth-bg-glow-a" />
        <div className="auth-bg-glow auth-bg-glow-b" />

        <div className="auth-card">
          <div className="auth-brand"><img src={logo} alt="" className="auth-logo" /><span>CollabHub</span></div>
          <div className="auth-spinner">
            <Loader2 size={32} className="spin" />
          </div>
          <h1>Verifying your email...</h1>
          <p className="auth-sub">Please wait while we verify your email address.</p>
        </div>
      </div>
    );
  }

  if (status === 'pending') {
    return (
      <div className="auth-shell">
        <div className="auth-bg-glow auth-bg-glow-a" />
        <div className="auth-bg-glow auth-bg-glow-b" />

        <div className="auth-card">
          <div className="auth-brand"><img src={logo} alt="" className="auth-logo" /><span>CollabHub</span></div>
          <div className="auth-status-icon success">
            <Mail size={48} />
          </div>
          <h1>Check Your Email</h1>
          <p className="auth-sub">
            We sent a verification link to your inbox. Click it to activate your account, then log in.
            Don't forget to check your spam folder.
          </p>

          {renderResendForm()}

          <a href="/" className="auth-link-btn">Back to Login</a>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-shell">
      <div className="auth-bg-glow auth-bg-glow-a" />
      <div className="auth-bg-glow auth-bg-glow-b" />

      <div className="auth-card">
        <div className="auth-brand"><img src={logo} alt="" className="auth-logo" /><span>CollabHub</span></div>
        <div className={`auth-status-icon ${status === 'success' ? 'success' : 'error'}`}>
          {status === 'success' ? <CheckCircle size={48} /> : <AlertCircle size={48} />}
        </div>
        <h1>{status === 'success' ? 'Email Verified!' : 'Verification Failed'}</h1>
        <p className="auth-sub">{message}</p>

        {status === 'success' && (
          <a href="/" className="btn btn-lime auth-submit" style={{ marginTop: 16 }}>
            Go to Login
          </a>
        )}

        {status === 'error' && (
          <>
            {renderResendForm()}
            <a href="/" className="auth-link-btn">Back to Login</a>
          </>
        )}
      </div>
    </div>
  );
}
