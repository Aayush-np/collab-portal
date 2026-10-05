import { useEffect, useRef, useState } from 'react';
import { Bell, Search, LogOut, MessageSquare, UserPlus, FolderGit2 } from 'lucide-react';
import { openChatWithUser } from '../utils/chatActions';
import { timeAgo } from '../utils/time';
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

const NOTIF_ICONS = {
  message: MessageSquare,
  connection: UserPlus,
  project: FolderGit2,
};

export default function Navbar({
  page,
  setPage,
  currentUser,
  onGlobalSearch,
  notifications = [],
  notificationUnreadCount = 0,
  onMarkNotificationsRead,
  onOpenNotification,
  onClearNotifications,
  onLogout,
}) {
  const [notifOpen, setNotifOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const notifRef = useRef(null);
  const logoutRef = useRef(null);
  const firstName = (currentUser?.name || 'User').split(' ')[0];
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);

  const unread = notificationUnreadCount;

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

  const toggleNotifications = () => {
    const opening = !notifOpen;
    setNotifOpen(opening);
    // Opening the panel marks everything as seen (standard bell behavior).
    if (opening && unread > 0) onMarkNotificationsRead?.();
  };

  const openNotification = (item) => {
    setNotifOpen(false);
    onOpenNotification?.(item);
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
          <button className="navbar-icon-btn" onClick={toggleNotifications} title="Notifications">
            <Bell size={18} />
            {unread > 0 && <span className="navbar-notif-dot">{unread > 99 ? '99+' : unread}</span>}
          </button>
          {notifOpen && (
            <div className="navbar-notif-panel">
              <div className="navbar-notif-title">
                Notifications
                {notifications.length > 0 && (
                  <button className="navbar-notif-clear" onClick={() => onClearNotifications?.()}>
                    Clear all
                  </button>
                )}
              </div>
              {notifications.length === 0 ? (
                <div className="navbar-notif-empty">No notifications yet.</div>
              ) : (
                <div className="navbar-notif-list">
                  {notifications.map((item) => {
                    const Icon = NOTIF_ICONS[item.type] || Bell;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`navbar-notif-item ${item.read ? '' : 'unread'} navbar-notif-item-btn`}
                        onClick={() => openNotification(item)}
                      >
                        <span className="navbar-notif-icon">
                          <Icon size={14} />
                        </span>
                        <span className="navbar-notif-text">{item.text}</span>
                        <span className="navbar-notif-time">{timeAgo(item.createdAt)}</span>
                      </button>
                    );
                  })}
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
          <div className="avatar avatar-sm" style={{ background: 'linear-gradient(135deg, var(--lime), var(--lime-dim))', color: 'var(--lime-ink)', fontSize: '11px', fontWeight: 800 }}>
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
