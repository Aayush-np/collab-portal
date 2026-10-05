import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { io } from 'socket.io-client';
import { LayoutDashboard, Search, PlusCircle, MessageSquare, User, Shield, UserPlus } from 'lucide-react';
import Sidebar from './components/Sidebar';
import Navbar from './components/Navbar';
import Dashboard from './pages/Dashboard';
import Explore from './pages/Explore';
import PostIdea from './pages/PostIdea';
import Messages from './pages/Messages';
import Profile from './pages/Profile';
import Admin from './pages/Admin';
import Requests from './pages/Requests';
import AuthPage from './pages/AuthPage';
import VerifyEmail from './pages/VerifyEmail';
import OtherUserProfile from './pages/OtherUserProfile';
import LegalPage from './pages/LegalPage';
import Toaster from './components/Toaster';
import { apiGet, apiPost, apiPut, apiDelete } from './services/api';
import { openChatWithUser } from './utils/chatActions';
import { toast } from './utils/toast';
import { currentUser as initialCurrentUser } from './data/mockData';
import './pages/Messages.css';

const toInitials = (name) => {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return initialCurrentUser.initials;
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
};

const clampPct = (val) => {
  const n = Number(val);
  if (Number.isNaN(n)) return 50;
  return Math.max(0, Math.min(100, Math.round(n)));
};

const normalizeUser = (user) => {
  const merged = { ...initialCurrentUser, ...(user || {}) };
  const skills = Array.isArray(merged.skills) ? merged.skills : initialCurrentUser.skills;
  const inputLevels = merged.skillLevels || {};
  const skillLevels = Object.fromEntries(
    skills.map((skill, i) => [
      skill,
      clampPct(inputLevels[skill] ?? initialCurrentUser.skillLevels?.[skill] ?? Math.max(50, 80 - i * 5)),
    ])
  );

  return {
    ...merged,
    skills,
    skillLevels,
    initials: toInitials(merged.name),
  };
};

const norm = (value) => String(value || '').toLowerCase().trim();

const makeBigrams = (text) => {
  const s = ` ${norm(text)} `;
  const grams = [];
  for (let i = 0; i < s.length - 1; i += 1) grams.push(s.slice(i, i + 2));
  return grams;
};

const diceSimilarity = (a, b) => {
  const g1 = makeBigrams(a);
  const g2 = makeBigrams(b);
  if (!g1.length || !g2.length) return 0;
  const counts = new Map();
  g1.forEach((g) => counts.set(g, (counts.get(g) || 0) + 1));
  let intersection = 0;
  g2.forEach((g) => {
    const c = counts.get(g) || 0;
    if (c > 0) {
      intersection += 1;
      counts.set(g, c - 1);
    }
  });
  return (2 * intersection) / (g1.length + g2.length);
};

const rankProject = (project, query) => {
  const q = norm(query);
  const title = norm(project.title);
  const description = norm(project.description);
  const skills = (project.skills || []).map(norm);
  const tags = (project.tags || []).map(norm);
  let score = 0;

  if (title === q) score += 120;
  if (title.includes(q)) score += 90;
  if (description.includes(q)) score += 40;
  if (skills.some((s) => s.includes(q))) score += 35;
  if (tags.some((t) => t.includes(q))) score += 25;

  const tokens = q.split(/\s+/).filter(Boolean);
  score += tokens.reduce((acc, token) => acc + (title.includes(token) ? 8 : 0), 0);
  score += Math.round(diceSimilarity(q, title) * 35);

  return score;
};

export default function App() {
  const [page, setPage] = useState('dashboard');
  const [viewingUserId, setViewingUserId] = useState(null);
  const [accessToken, setAccessToken] = useState(() => localStorage.getItem('accessToken') || '');
  const [refreshToken, setRefreshToken] = useState(() => localStorage.getItem('refreshToken') || '');
  const [authLoading, setAuthLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState(initialCurrentUser);
  const [messageUnreadCount, setMessageUnreadCount] = useState(0);
  const [requestUnreadCount, setRequestUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0);
  const [editingIdea, setEditingIdea] = useState(null);
  const [authUser, setAuthUser] = useState(() => {
    const raw = localStorage.getItem('authUser');
    return raw ? JSON.parse(raw) : null;
  });

  const isAdminRole = ['superadmin', 'editor-admin', 'support-admin', 'admin'].includes(authUser?.role || 'user');
  const apiBase = import.meta.env.VITE_API_BASE_URL || '/api';
  const socketUrl = useMemo(
    () => import.meta.env.VITE_SOCKET_URL || (apiBase.startsWith('http') ? apiBase.replace(/\/api\/?$/, '') : 'http://localhost:4000'),
    [apiBase]
  );

  const applySession = (session) => {
    const nextAccess = session?.accessToken || '';
    const nextRefresh = session?.refreshToken || '';
    const profile = normalizeUser(session?.profile || initialCurrentUser);
    const user = session?.user || null;

    setAccessToken(nextAccess);
    setRefreshToken(nextRefresh);
    setCurrentUser(profile);
    setAuthUser(user);

    localStorage.setItem('accessToken', nextAccess);
    localStorage.setItem('refreshToken', nextRefresh);
    localStorage.setItem('currentUser', JSON.stringify(profile));
    localStorage.setItem('authUser', JSON.stringify(user));
    setPage('dashboard');
  };

  const clearSession = async () => {
    if (refreshToken) {
      try {
        await apiPost('/auth/logout', { refreshToken });
      } catch {
        // Ignore logout network errors while clearing local session.
      }
    }

    setAccessToken('');
    setRefreshToken('');
    setCurrentUser(initialCurrentUser);
    setAuthUser(null);
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('currentUser');
    localStorage.removeItem('authUser');
    setPage('dashboard');
  };

  useEffect(() => {
    const savedProfile = localStorage.getItem('currentUser');
    if (savedProfile) {
      setCurrentUser(normalizeUser(JSON.parse(savedProfile)));
    }
  }, []);

  useEffect(() => {
    if (!accessToken && !refreshToken) return;

    let active = true;

    const loadSession = async () => {
      let tokenForMe = accessToken;
      if (!tokenForMe && refreshToken) {
        const refreshed = await apiPost('/auth/refresh', { refreshToken });
        if (!active) return;
        applySession(refreshed);
        tokenForMe = refreshed.accessToken;
      }

      if (!tokenForMe) throw new Error('No active session.');

      const session = await apiGet('/auth/me', tokenForMe);
      if (!active) return;

      const profile = normalizeUser(session.profile);
      setCurrentUser(profile);
      setAuthUser(session.user || null);
      localStorage.setItem('currentUser', JSON.stringify(profile));
      localStorage.setItem('authUser', JSON.stringify(session.user || null));
    };

    loadSession().catch(async () => {
      if (!active) return;

      if (refreshToken) {
        try {
          const refreshed = await apiPost('/auth/refresh', { refreshToken });
          if (!active) return;
          applySession(refreshed);

          const session = await apiGet('/auth/me', refreshed.accessToken);
          if (!active) return;
          const profile = normalizeUser(session.profile);
          setCurrentUser(profile);
          setAuthUser(session.user || null);
          localStorage.setItem('currentUser', JSON.stringify(profile));
          localStorage.setItem('authUser', JSON.stringify(session.user || null));
          return;
        } catch {
          // Fall through to clear session.
        }
      }

      await clearSession();
    });

    return () => {
      active = false;
    };
  }, [accessToken, refreshToken]);

  useEffect(() => {
    if (!accessToken) return;
    localStorage.setItem('currentUser', JSON.stringify(normalizeUser(currentUser)));
  }, [accessToken, currentUser]);

  const withAccessRetry = async (requestFn) => {
    try {
      return await requestFn(accessToken);
    } catch (error) {
      if (!refreshToken) throw error;

      const refreshed = await apiPost('/auth/refresh', { refreshToken });
      applySession(refreshed);
      return requestFn(refreshed.accessToken);
    }
  };

  // ── Notifications ────────────────────────────────────────────────
  const pageRef = useRef(page);
  pageRef.current = page;

  const loadNotifications = async () => {
    if (!accessToken) {
      setNotifications([]);
      setNotificationUnreadCount(0);
      return;
    }
    try {
      const result = await withAccessRetry((token) => apiGet('/notifications', token));
      setNotifications(result.notifications || []);
      setNotificationUnreadCount(result.unreadCount || 0);
    } catch {
      // Non-critical: leave current list untouched.
    }
  };

  useEffect(() => {
    loadNotifications();
  }, [accessToken]);

  const markAllNotificationsRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setNotificationUnreadCount(0);
    try {
      await withAccessRetry((token) => apiPost('/notifications/read', {}, token));
    } catch {
      // Optimistic state is fine even if the sync fails.
    }
  };

  const clearAllNotifications = async () => {
    setNotifications([]);
    setNotificationUnreadCount(0);
    try {
      await withAccessRetry((token) => apiDelete('/notifications', token));
    } catch {
      // Ignore — cleared locally anyway.
    }
  };

  const openNotification = (n) => {
    if (!n) return;
    if (n.type === 'message' && n.actorUserId) {
      openChatWithUser({ userId: n.actorUserId, setPage: handleNavigate });
      return;
    }
    handleNavigate('requests');
  };

  useEffect(() => {
    if (!accessToken) return;

    withAccessRetry((token) => apiGet('/messages/conversations', token))
      .then((result) => setMessageUnreadCount(result.unreadTotal || 0))
      .catch(() => setMessageUnreadCount(0));
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken || !socketUrl) return;

    const socket = io(socketUrl, {
      auth: { token: accessToken },
    });

    const refreshConnections = () => {
      refreshRequestBadge();
      window.dispatchEvent(new CustomEvent('connections-changed'));
    };

    socket.on('connection:request:new', refreshConnections);
    socket.on('connection:request:updated', refreshConnections);
    socket.on('connections:changed', refreshConnections);

    socket.on('notification:new', (n) => {
      if (!n?.id) return;
      setNotifications((prev) => [n, ...prev.filter((p) => p.id !== n.id)].slice(0, 50));
      setNotificationUnreadCount((count) => count + 1);
      // Skip the toast while the user is already watching the live chat.
      const liveChat = n.type === 'message' && pageRef.current === 'messages';
      if (!liveChat) toast(n.text, 'info');
    });

    socket.on('ideas:changed', () => {
      window.dispatchEvent(new CustomEvent('ideas-changed'));
    });

    return () => {
      socket.disconnect();
    };
  }, [accessToken, socketUrl]);

  const refreshRequestBadge = async () => {
    if (!accessToken) {
      setRequestUnreadCount(0);
      return;
    }
    try {
      const result = await withAccessRetry((token) => apiGet('/connections/summary', token));
      setRequestUnreadCount(result.incomingCount || 0);
    } catch {
      setRequestUnreadCount(0);
    }
  };

  useEffect(() => {
    refreshRequestBadge();
  }, [accessToken]);

  useEffect(() => {
    const handler = (event) => {
      const idea = event.detail?.idea;
      if (!idea) return;
      setEditingIdea(idea);
      setPage('post');
    };

    window.addEventListener('idea-edit-request', handler);
    return () => window.removeEventListener('idea-edit-request', handler);
  }, []);

  useEffect(() => {
    const clearHandler = () => {
      setEditingIdea(null);
    };

    window.addEventListener('idea-edit-done', clearHandler);
    return () => window.removeEventListener('idea-edit-done', clearHandler);
  }, []);

  useEffect(() => {
    const handler = () => {
      refreshRequestBadge();
    };

    window.addEventListener('connections-changed', handler);
    return () => window.removeEventListener('connections-changed', handler);
  }, [accessToken, refreshToken]);

  // Navigation that leaves the profile page should stop viewing another user.
  const handleNavigate = (nextPage) => {
    setViewingUserId(null);
    setPage(nextPage);
  };

  const handleGlobalSearch = async (query) => {
    const q = query.trim();
    if (!q) return [];

    const [usersResult, ideasResult] = await Promise.all([
      withAccessRetry((token) => apiGet(`/messages/users?q=${encodeURIComponent(q)}`, token)),
      withAccessRetry((token) => apiGet('/ideas', token)),
    ]);

    const userResults = (usersResult.users || []).map((user) => ({
      id: user.id,
      type: 'user',
      title: user.name,
      subtitle: user.email,
      initials: user.initials,
    }));

    const rankedProjects = (ideasResult.ideas || [])
      .map((project) => ({ project, score: rankProject(project, q) }))
      .filter((entry) => entry.score > 12)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map(({ project }) => ({
        id: project.id,
        type: 'project',
        title: project.title,
        subtitle: `${project.author?.name || 'User'}${project.type ? ` · ${project.type}` : ''}`,
        status: project.status || 'Recruiting',
      }));

    return [...userResults, ...rankedProjects].slice(0, 12);
  };

  const handleRegister = async (payload) => {
    setAuthLoading(true);
    try {
      const result = await apiPost('/auth/register', payload);
      if (result.requiresVerification) {
        setAuthLoading(false);
        setPage('verify-email');
      } else {
        applySession(result);
      }
    } catch (err) {
      setAuthLoading(false);
      throw err;
    }
  };

  const handleLogin = async (payload) => {
    setAuthLoading(true);
    try {
      const session = await apiPost('/auth/login', payload);
      applySession(session);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogleLogin = async (idToken) => {
    setAuthLoading(true);
    try {
      const session = await apiPost('/auth/google', { idToken });
      applySession(session);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleForgotPassword = async (payload) => {
    setAuthLoading(true);
    try {
      return await apiPost('/auth/forgot-password', payload);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleResetPassword = async (payload) => {
    setAuthLoading(true);
    try {
      return await apiPost('/auth/reset-password', payload);
    } finally {
      setAuthLoading(false);
    }
  };

  const updateCurrentUser = async (nextUser) => {
    const normalized = normalizeUser(nextUser);
    setCurrentUser(normalized);
    localStorage.setItem('currentUser', JSON.stringify(normalized));

    if (!accessToken) return;

    try {
      const result = await withAccessRetry((token) => apiPut('/user/profile', normalized, token));
      const synced = normalizeUser(result.profile);
      setCurrentUser(synced);
      localStorage.setItem('currentUser', JSON.stringify(synced));
    } catch {
      // Keep optimistic UI if save fails to avoid interrupting editing flow.
    }
  };

  const renderPage = () => {
    switch (page) {
      case 'dashboard':
        return (
          <Dashboard
            setPage={setPage}
            currentUser={currentUser}
            accessToken={accessToken}
            withAccessRetry={withAccessRetry}
            setViewingUserId={setViewingUserId}
            notifications={notifications}
            notificationUnreadCount={notificationUnreadCount}
          />
        );
      case 'explore':
        return <Explore setPage={setPage} currentUser={currentUser} accessToken={accessToken} withAccessRetry={withAccessRetry} setViewingUserId={setViewingUserId} />;
      case 'post':
        return (
          <PostIdea
            setPage={setPage}
            onPageChange={(newPage) => { setViewingUserId(null); setPage(newPage); }}
            currentUser={currentUser}
            accessToken={accessToken}
            withAccessRetry={withAccessRetry}
            editingIdea={editingIdea}
            onDone={() => setEditingIdea(null)}
          />
        );
      case 'messages':
        return (
          <Messages
            currentUser={currentUser}
            accessToken={accessToken}
            withAccessRetry={withAccessRetry}
            onUnreadChange={setMessageUnreadCount}
          />
        );
      case 'profile':
        if (viewingUserId && viewingUserId !== currentUser.id) {
          return <OtherUserProfile userId={viewingUserId} setPage={setPage} currentUser={currentUser} accessToken={accessToken} withAccessRetry={withAccessRetry} onBack={() => { setViewingUserId(null); setPage('explore'); }} />;
        }
        return <Profile setPage={setPage} currentUser={currentUser} setCurrentUser={updateCurrentUser} accessToken={accessToken} withAccessRetry={withAccessRetry} />;
      case 'requests':
        return <Requests accessToken={accessToken} withAccessRetry={withAccessRetry} setPage={setPage} onCountsChange={(count) => setRequestUnreadCount(count)} />;
      case 'admin':
        return isAdminRole
          ? <Admin accessToken={accessToken} withAccessRetry={withAccessRetry} authUser={authUser} />
          : <Dashboard setPage={setPage} currentUser={currentUser} />;
      case 'verify-email':
        return <VerifyEmail />;
      default:
        return <Dashboard setPage={setPage} currentUser={currentUser} />;
    }
  };

  // Legal pages are public and render for everyone, signed in or not.
  const legalDoc = window.location.pathname === '/privacy'
    ? 'privacy'
    : window.location.pathname === '/terms'
      ? 'terms'
      : '';

  if (legalDoc) {
    return <LegalPage doc={legalDoc} />;
  }

  if (!accessToken && !refreshToken) {
    // The verify-email screen must render even while logged out:
    // - right after registering (page state), and
    // - when opening the link from the verification email (URL path).
    if (page === 'verify-email' || window.location.pathname.startsWith('/verify-email')) {
      return <VerifyEmail />;
    }
    return (
      <AuthPage
        onLogin={handleLogin}
        onRegister={handleRegister}
        onGoogleLogin={handleGoogleLogin}
        onForgotPassword={handleForgotPassword}
        onResetPassword={handleResetPassword}
        loading={authLoading}
      />
    );
  }

  const isMessages = page === 'messages';
  const mobileNavItems = [
    { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
    { id: 'explore', label: 'Explore', icon: Search },
    { id: 'post', label: 'Post', icon: PlusCircle },
    { id: 'messages', label: 'Messages', icon: MessageSquare, badge: messageUnreadCount },
    { id: 'requests', label: 'Requests', icon: UserPlus, badge: requestUnreadCount },
    { id: 'profile', label: 'Profile', icon: User },
    ...(isAdminRole ? [{ id: 'admin', label: 'Admin', icon: Shield }] : []),
  ];

  return (
    <div className="app-layout">
      <Sidebar
        page={page}
        setPage={handleNavigate}
        currentUser={currentUser}
        isAdmin={isAdminRole}
        messageUnreadCount={messageUnreadCount}
        requestUnreadCount={requestUnreadCount}
        onLogout={() => { clearSession(); }}
      />
      <div className="main-content">
        <Navbar
          page={page}
          setPage={handleNavigate}
          currentUser={currentUser}
          onGlobalSearch={handleGlobalSearch}
          notifications={notifications}
          notificationUnreadCount={notificationUnreadCount}
          onMarkNotificationsRead={markAllNotificationsRead}
          onOpenNotification={openNotification}
          onClearNotifications={clearAllNotifications}
          onLogout={() => { clearSession(); }}
        />
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={page}
            className="page-shell"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
          >
            {isMessages ? (
              renderPage()
            ) : (
              <div style={{ display: 'flex', justifyContent: 'center', flex: 1 }}>
                {renderPage()}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <Toaster />
      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        {mobileNavItems.map(({ id, label, icon: Icon, badge }) => (
          <button
            key={id}
            className={`mobile-nav-item ${page === id ? 'active' : ''}`}
            onClick={() => handleNavigate(id)}
          >
            {page === id && (
              <motion.span
                layoutId="mobile-nav-pill"
                className="mobile-pill"
                transition={{ type: 'spring', bounce: 0.2, visualDuration: 0.4 }}
              />
            )}
            <span className="mobile-nav-icon-wrap">
              <Icon size={17} />
              {badge > 0 && <span className="mobile-nav-badge">{badge > 99 ? '99+' : badge}</span>}
            </span>
            <span className="mobile-nav-label">{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
