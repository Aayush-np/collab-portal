import { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, Search, LogOut } from 'lucide-react';
import { notifications } from '../data/mockData';
import { openChatWithUser } from '../utils/chatActions';
import './Navbar.css';

const pageTitles = {
  dashboard: 'Dashboard',
  explore: 'Explore Projects',
  post: 'Post a New Idea',
  messages: 'Messages',
  requests: 'Requests',
  profile: 'My Profile',
  admin: 'Admin Control Center',
};

export default function Navbar({ page, setPage, currentUser, onGlobalSearch, messageUnreadCount = 0, requestUnreadCount = 0, onLogout }) {
  const [notifOpen, setNotifOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const notifRef = useRef(null);
  const logoutRef = useRef(null);
  const firstName = (currentUser?.name || 'User').split(' ')[0];
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);

  const notificationItems = useMemo(() => {
    const base = (notifications || []).map((n) => ({
      id: n.id,
      text: n.text,
      time: n.time,
      read: Boolean(n.read),
    }));

    if (messageUnreadCount > 0) {
      base.unshift({
        id: 'messages-unread',
        text: `You have ${messageUnreadCount} unread message${messageUnreadCount > 1 ? 's' : ''}`,
        time: 'Now',
        read: false,
      });
    }

    if (requestUnreadCount > 0) {
      base.unshift({
        id: 'requests-unread',
        text: `You have ${requestUnreadCount} new connection request${requestUnreadCount > 1 ? 's' : ''}`,
        time: 'Now',
        read: false,
      });
    }
    return base;
  }, [messageUnreadCount, requestUnreadCount]);

  const unread = notificationItems.filter((n) => !n.read).length;

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return undefined;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const items = await onGlobalSearch?.(q);
        if (!cancelled) setResults(items || []);
      } catch {
        if (!cancelled) setResults([]);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, onGlobalSearch]);

  useEffect(() => {
    const closeOnOutside = (event) => {
      if (!notifRef.current) return;
      if (!notifRef.current.contains(event.target)) {
        setNotifOpen(false);
      }

      if (logoutRef.current && !logoutRef.current.contains(event.target)) {
        setLogoutOpen(false);
      }
    };

    document.addEventListener('mousedown', closeOnOutside);
    return () => document.removeEventListener('mousedown', closeOnOutside);
  }, []);

  const openUserResult = (userId) => {
    openChatWithUser({ userId, setPage });
    setResults([]);
    setQuery('');
  };

  const openProjectResult = (projectId, projectTitle) => {
    window.dispatchEvent(new CustomEvent('open-project-from-search', { detail: { projectId, query: projectTitle } }));
    setPage('explore');
    setResults([]);
    setQuery('');
  };

  const openResult = (result) => {
    if (result.type === 'project') {
      openProjectResult(result.id, result.title);
      return;
    }
    openUserResult(result.id);
  };

  const openNotification = (item) => {
    if (!item?.id) return;

    if (item.id === 'messages-unread') {
      setPage('messages');
      setNotifOpen(false);
      return;
    }

    if (item.id === 'requests-unread') {
      setPage('requests');
      setNotifOpen(false);
    }
  };

  return (
    <header className="navbar">
      <div className="navbar-left">
        <div className="navbar-title">{pageTitles[page] || 'CollabHub'}</div>
      </div>
      <div className="navbar-center">
        <div className="navbar-search-wrap">
          <div className="navbar-search">
            <Search size={14} />
            <input
              placeholder="Search people and projects..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {query.trim() && (
            <div className="navbar-search-results">
              {results.length === 0 ? (
                <div className="navbar-search-empty">No results</div>
              ) : (
                results.map((r) => (
                  <button key={`${r.type}-${r.id}`} className="navbar-search-item" onClick={() => openResult(r)}>
                    <div className="avatar avatar-sm" style={{ background: 'var(--teal)', color: '#0a0f1c', fontWeight: 700, fontSize: 11 }}>
                      {r.type === 'project' ? 'P' : (r.initials || String(r.title || 'U').slice(0, 1))}
                    </div>
                    <div>
                      <div className="navbar-search-name">{r.title}</div>
                      <div className="navbar-search-email">{r.subtitle}</div>
                    </div>
                    <span className={`navbar-search-type ${r.type === 'project' ? 'project' : 'user'}`}>
                      {r.type === 'project' ? 'Project' : 'Person'}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>
      <div className="navbar-right">
        <div className="navbar-notif-wrap" ref={notifRef}>
          <button className="navbar-icon-btn" onClick={() => setNotifOpen((v) => !v)}>
            <Bell size={18} />
            {unread > 0 && <span className="navbar-notif-dot">{unread}</span>}
          </button>
          {notifOpen && (
            <div className="navbar-notif-panel">
              <div className="navbar-notif-title">Notifications</div>
              {notificationItems.length === 0 ? (
                <div className="navbar-notif-empty">No notifications yet.</div>
              ) : (
                <div className="navbar-notif-list">
                  {notificationItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`navbar-notif-item ${item.read ? '' : 'unread'} navbar-notif-item-btn`}
                      onClick={() => openNotification(item)}
                    >
                      <div className="navbar-notif-text">{item.text}</div>
                      <div className="navbar-notif-time">{item.time || 'Now'}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <div
          className="navbar-user"
          onClick={() => setPage('profile')}
          title="View profile"
        >
          <div className="avatar avatar-sm" style={{ background: 'linear-gradient(135deg, #818cf8, var(--lime-dim))', color: '#ffffff', fontSize: '11px', fontWeight: 800 }}>
            {currentUser.initials}
          </div>
          <span className="navbar-username">{firstName}</span>
        </div>
        <div className="navbar-logout-wrap" ref={logoutRef}>
          <button className="navbar-logout-btn" onClick={() => setLogoutOpen((v) => !v)} title="Logout" aria-label="Logout">
            <LogOut size={16} />
            <span>Logout</span>
          </button>
          {logoutOpen && (
            <div className="navbar-logout-popout">
              <div className="navbar-logout-title">Logout?</div>
              <div className="navbar-logout-text">Are you sure you want to logout?</div>
              <div className="navbar-logout-actions">
                <button className="btn btn-ghost btn-sm" onClick={() => setLogoutOpen(false)}>Cancel</button>
                <button className="btn btn-outline btn-sm" onClick={() => onLogout?.()}>
                  <LogOut size={13} /> Confirm
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
