import {
  LayoutDashboard, Search, PlusCircle, MessageSquare,
  User, Bell, LogOut, Zap, ChevronRight, Shield, UserPlus
} from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { notifications } from '../data/mockData';
import './Sidebar.css';

export default function Sidebar({ page, setPage, currentUser, isAdmin, onLogout, messageUnreadCount = 0, requestUnreadCount = 0 }) {
  const [logoutOpen, setLogoutOpen] = useState(false);
  const unread = notifications.filter(n => !n.read).length;
  const firstName = (currentUser?.name || 'User').split(' ')[0];
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'explore', label: 'Explore', icon: Search },
    { id: 'post', label: 'Post Idea', icon: PlusCircle },
    { id: 'messages', label: 'Messages', icon: MessageSquare, badge: messageUnreadCount > 0 ? messageUnreadCount : null },
    { id: 'requests', label: 'Requests', icon: UserPlus, badge: requestUnreadCount > 0 ? requestUnreadCount : null },
    { id: 'profile', label: 'My Profile', icon: User },
    ...(isAdmin ? [{ id: 'admin', label: 'Admin', icon: Shield }] : []),
  ];

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo" onClick={() => setPage('dashboard')}>
        <div className="logo-icon">
          <Zap size={20} fill="currentColor" />
        </div>
        <div>
          <div className="logo-text">CollabHub</div>
          <div className="logo-sub">CMRIT Portal</div>
        </div>
      </div>

      <div className="divider" />

      {/* Navigation */}
      <nav className="sidebar-nav">
        {navItems.map(({ id, label, icon: Icon, badge }) => (
          <button
            key={id}
            className={`nav-item ${page === id ? 'active' : ''}`}
            onClick={() => setPage(id)}
          >
            {page === id && (
              <motion.span
                layoutId="sidebar-active-pill"
                className="nav-pill"
                transition={{ type: 'spring', bounce: 0.18, visualDuration: 0.4 }}
              />
            )}
            <Icon size={18} />
            <span>{label}</span>
            {badge && <span className="nav-badge">{badge}</span>}
            {page === id && <ChevronRight size={14} className="nav-arrow" />}
          </button>
        ))}
      </nav>

      <div className="divider" />

      {/* Notifications quick link */}
      <button className="nav-item notif-item" onClick={() => {}}>
        <Bell size={18} />
        <span>Notifications</span>
        {unread > 0 && <span className="nav-badge">{unread}</span>}
      </button>

      {/* User card at bottom */}
      <div className="sidebar-user">
        <div className="avatar avatar-sm" style={{ background: 'linear-gradient(135deg, #818cf8, var(--lime-dim))', color: '#ffffff' }}>
          {currentUser.initials}
        </div>
        <div className="sidebar-user-info">
          <div className="sidebar-user-name">{firstName}</div>
          <div className="sidebar-user-usn">{currentUser.usn}</div>
        </div>
        <button className="btn btn-ghost btn-sm logout-btn" onClick={() => setLogoutOpen((v) => !v)}>
          <LogOut size={14} />
        </button>
      </div>
      {logoutOpen && (
        <div className="sidebar-logout-popout">
          <div className="sidebar-logout-title">Logout?</div>
          <div className="sidebar-logout-text">Are you sure you want to logout?</div>
          <div className="sidebar-logout-actions">
            <button className="btn btn-ghost btn-sm" onClick={() => setLogoutOpen(false)}>Cancel</button>
            <button className="btn btn-outline btn-sm" onClick={() => onLogout?.()}>
              <LogOut size={13} /> Confirm
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
