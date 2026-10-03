import { useEffect, useState } from 'react';
import { Mail, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { apiPost } from '../services/api';
import './Auth.css';

export default function VerifyEmail() {
  const [status, setStatus] = useState('verifying'); // verifying | success | error
  const [message, setMessage] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');

    if (!token) {
      setStatus('error');
      setMessage('No verification token provided.');
      return;
    }

    const verify = async () => {
      try {
        const result = await apiPost('/auth/verify-email', { token });
        if (result.ok) {
          setStatus('success');
          setMessage('Your email has been verified! You can now log in.');
        } else {
          setStatus('error');
          setMessage('Verification failed. Please try registering again.');
        }
      } catch (err) {
        setStatus('error');
        setMessage(err.message || 'Verification failed. Please try again.');
      }
    };

    verify();
  }, []);

  if (status === 'verifying') {
    return (
      <div className="auth-shell">
        <div className="auth-bg-glow auth-bg-glow-a" />
        <div className="auth-bg-glow auth-bg-glow-b" />

        <div className="auth-card">
          <div className="auth-brand">CollabHub</div>
          <div className="auth-spinner">
            <Loader2 size={32} className="spin" />
          </div>
          <h1>Verifying your email...</h1>
          <p className="auth-sub">Please wait while we verify your email address.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-shell">
      <div className="auth-bg-glow auth-bg-glow-a" />
      <div className="auth-bg-glow auth-bg-glow-b" />

      <div className="auth-card">
        <div className="auth-brand">CollabHub</div>
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
          <a href="/register" className="btn btn-lime auth-submit" style={{ marginTop: 16 }}>
            Try Registering Again
          </a>
        )}
      </div>
    </div>
  );
}