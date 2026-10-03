import { useEffect, useState } from 'react';
import { ShieldCheck, RefreshCw, Save, Trash2, KeyRound, Users, ScrollText, Activity } from 'lucide-react';
import { apiGet, apiPost, apiPut, apiDelete } from '../services/api';
import { toast } from '../utils/toast';
import './Admin.css';

const roleOrder = ['superadmin', 'editor-admin', 'support-admin', 'user'];

const actionLabels = {
  'idea.create': 'Created an idea',
  'idea.delete': 'Deleted a post',
  'user.update': 'Updated a user',
  'profile.update': 'Updated a profile',
  'user.password.reset': 'Reset a user password',
  'user.delete': 'Deleted a user',
  'user.sessions.revoke': 'Revoked user sessions',
};

const formatAuditLine = (log) => {
  const actor = log.actorName || 'Unknown user';
  const action = actionLabels[log.action] || log.action;
  const target = log.targetName ? ` for ${log.targetName}` : '';
  return `${actor} (${log.actorRole || 'user'}) ${action}${target}`;
};

export default function Admin({ accessToken, withAccessRetry, authUser }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [auditLogs, setAuditLogs] = useState([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [userQuery, setUserQuery] = useState({ page: 1, limit: 8, search: '', sortBy: 'createdAt', sortOrder: 'desc' });
  const [selectedUserId, setSelectedUserId] = useState('');
  const [editUser, setEditUser] = useState(null);
  const [editProfile, setEditProfile] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [ideas, setIdeas] = useState([]);
  const [deletingIdeaId, setDeletingIdeaId] = useState('');
  const [confirmingUserDelete, setConfirmingUserDelete] = useState(false);
  const [confirmingIdeaId, setConfirmingIdeaId] = useState('');

  useEffect(() => {
    setConfirmingUserDelete(false);
  }, [selectedUserId]);

  const loadOverview = async () => {
    setLoading(true);
    setError('');
    try {
      const [overview, usersRes, profilesRes, logsRes, ideasRes] = await Promise.all([
        withAccessRetry((token) => apiGet('/admin/overview', token || accessToken)),
        withAccessRetry((token) => apiGet(`/admin/users?page=${userQuery.page}&limit=${userQuery.limit}&search=${encodeURIComponent(userQuery.search)}&sortBy=${userQuery.sortBy}&sortOrder=${userQuery.sortOrder}`, token || accessToken)),
        withAccessRetry((token) => apiGet('/admin/profiles', token || accessToken)),
        withAccessRetry((token) => apiGet('/admin/audit-logs?page=1&limit=12', token || accessToken)),
        withAccessRetry((token) => apiGet('/ideas', token || accessToken)),
      ]);

      setStats(overview.stats);
      setUsers(usersRes.users || []);
      setTotalUsers(usersRes.total || 0);
      setProfiles(profilesRes.profiles || {});
      setAuditLogs(logsRes.logs || []);
      setIdeas((ideasRes.ideas || []).slice(0, 12));

      if (!selectedUserId && usersRes.users?.length) {
        const id = usersRes.users[0].id;
        setSelectedUserId(id);
        setEditUser(usersRes.users[0]);
        setEditProfile(profilesRes.profiles?.[id] || null);
      }
    } catch (e) {
      setError(e.message || 'Failed to load admin data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOverview();
  }, [userQuery.page, userQuery.limit, userQuery.search, userQuery.sortBy, userQuery.sortOrder]);

  useEffect(() => {
    if (!selectedUserId) return;
    const user = users.find((u) => u.id === selectedUserId) || null;
    setEditUser(user);
    setEditProfile(profiles[selectedUserId] || null);
  }, [selectedUserId, users, profiles]);

  const saveUser = async () => {
    if (!editUser) return;
    try {
      await withAccessRetry((token) => apiPut(`/admin/users/${editUser.id}`, editUser, token || accessToken));
      toast('User saved.', 'success');
      await loadOverview();
    } catch (e) {
      toast(e.message || 'Could not save user.', 'error');
    }
  };

  const saveProfile = async () => {
    if (!editProfile || !selectedUserId) return;
    try {
      await withAccessRetry((token) => apiPut(`/admin/profiles/${selectedUserId}`, editProfile, token || accessToken));
      toast('Profile saved.', 'success');
      await loadOverview();
    } catch (e) {
      toast(e.message || 'Could not save profile.', 'error');
    }
  };

  const resetUserPassword = async () => {
    if (!selectedUserId || !newPassword) return;
    try {
      await withAccessRetry((token) => apiPost(`/admin/users/${selectedUserId}/password`, { newPassword }, token || accessToken));
      setNewPassword('');
      toast('Password updated.', 'success');
      await loadOverview();
    } catch (e) {
      toast(e.message || 'Could not update password.', 'error');
    }
  };

  const revokeSessions = async () => {
    if (!selectedUserId) return;
    try {
      await withAccessRetry((token) => apiPost(`/admin/users/${selectedUserId}/revoke-sessions`, {}, token || accessToken));
      toast('Sessions revoked.', 'success');
      await loadOverview();
    } catch (e) {
      toast(e.message || 'Could not revoke sessions.', 'error');
    }
  };

  const deleteUser = async () => {
    if (!selectedUserId) return;
    if (!confirmingUserDelete) {
      setConfirmingUserDelete(true);
      return;
    }
    try {
      await withAccessRetry((token) => apiDelete(`/admin/users/${selectedUserId}`, token || accessToken));
      toast('User deleted.', 'success');
      setConfirmingUserDelete(false);
      setSelectedUserId('');
      await loadOverview();
    } catch (e) {
      toast(e.message || 'Could not delete user.', 'error');
    }
  };

  const deleteIdea = async (ideaId) => {
    if (!ideaId) return;
    if (confirmingIdeaId !== ideaId) {
      setConfirmingIdeaId(ideaId);
      return;
    }
    setDeletingIdeaId(ideaId);
    try {
      await withAccessRetry((token) => apiDelete(`/ideas/${ideaId}`, token || accessToken));
      toast('Post deleted.', 'success');
      setConfirmingIdeaId('');
      await loadOverview();
    } catch (e) {
      toast(e.message || 'Could not delete post.', 'error');
    } finally {
      setDeletingIdeaId('');
    }
  };

  const canEdit = ['superadmin', 'editor-admin'].includes(authUser?.role || '');
  const canSecurity = ['superadmin', 'support-admin', 'admin'].includes(authUser?.role || '');
  const canDelete = authUser?.role === 'superadmin';
  const canDeletePosts = ['superadmin', 'editor-admin', 'support-admin', 'admin'].includes(authUser?.role || '');
  const canChangeRoles = authUser?.role === 'superadmin';
  const totalPages = Math.max(1, Math.ceil(totalUsers / userQuery.limit));

  if (loading) {
    return <div className="page-container"><div className="card">Loading admin panel...</div></div>;
  }

  return (
    <div className="page-container admin-page">
      <div className="admin-topbar">
        <div>
          <h1><ShieldCheck size={18} /> Admin Control Center</h1>
          <p className="muted">View and manage all users, profiles, and active auth data.</p>
        </div>
        <button className="btn btn-outline btn-sm" onClick={loadOverview}><RefreshCw size={14} /> Refresh</button>
      </div>

      {error && <div className="card admin-error">{error}</div>}

      <div className="grid-4 admin-stats">
        <Stat label="Users" val={stats?.users || 0} icon={Users} />
        <Stat label="Profiles" val={stats?.profiles || 0} icon={ScrollText} />
        <Stat label="Active Sessions" val={stats?.activeSessions || 0} icon={Activity} />
        <Stat label="Admins" val={stats?.admins || 0} icon={ShieldCheck} />
      </div>

      <div className="admin-grid">
        <div className="card admin-users-card">
          <h3>All Users</h3>
          <div className="admin-list-controls">
            <input
              placeholder="Search by name or email"
              value={userQuery.search}
              onChange={(e) => setUserQuery((p) => ({ ...p, page: 1, search: e.target.value }))}
            />
            <div className="form-row">
              <select value={userQuery.sortBy} onChange={(e) => setUserQuery((p) => ({ ...p, sortBy: e.target.value }))}>
                <option value="createdAt">Created</option>
                <option value="updatedAt">Updated</option>
                <option value="name">Name</option>
                <option value="email">Email</option>
                <option value="role">Role</option>
              </select>
              <select value={userQuery.sortOrder} onChange={(e) => setUserQuery((p) => ({ ...p, sortOrder: e.target.value }))}>
                <option value="desc">Desc</option>
                <option value="asc">Asc</option>
              </select>
            </div>
          </div>
          <div className="admin-users-list">
            {users.map((u) => (
              <button
                key={u.id}
                className={`admin-user-item ${selectedUserId === u.id ? 'active' : ''}`}
                onClick={() => setSelectedUserId(u.id)}
              >
                <div>
                  <div className="admin-user-name">{u.name}</div>
                  <div className="admin-user-email">{u.email}</div>
                </div>
                <span className={`badge ${u.role !== 'user' ? 'badge-lime' : 'badge-white'}`}>{u.role}</span>
              </button>
            ))}
          </div>
          <div className="admin-pagination">
            <button className="btn btn-outline btn-sm" disabled={userQuery.page <= 1} onClick={() => setUserQuery((p) => ({ ...p, page: p.page - 1 }))}>Prev</button>
            <span>Page {userQuery.page} / {totalPages}</span>
            <button className="btn btn-outline btn-sm" disabled={userQuery.page >= totalPages} onClick={() => setUserQuery((p) => ({ ...p, page: p.page + 1 }))}>Next</button>
          </div>
        </div>

        <div className="card admin-editor-card">
          <h3>User Controls</h3>
          {editUser ? (
            <>
              <div className="form-group">
                <label>Name</label>
                <input value={editUser.name || ''} onChange={(e) => setEditUser((p) => ({ ...p, name: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input value={editUser.email || ''} onChange={(e) => setEditUser((p) => ({ ...p, email: e.target.value }))} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Role</label>
                  <select
                    disabled={!canChangeRoles}
                    value={editUser.role || 'user'}
                    onChange={(e) => setEditUser((p) => ({ ...p, role: e.target.value }))}
                  >
                    {roleOrder.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Provider</label>
                  <select value={editUser.provider || 'local'} onChange={(e) => setEditUser((p) => ({ ...p, provider: e.target.value }))}>
                    <option value="local">local</option>
                    <option value="google">google</option>
                  </select>
                </div>
              </div>

              <div className="admin-actions-row">
                <button className="btn btn-lime btn-sm" disabled={!canEdit} onClick={saveUser}><Save size={14} /> Save User</button>
                <button className="btn btn-outline btn-sm" disabled={!canSecurity} onClick={revokeSessions}><KeyRound size={14} /> Revoke Sessions</button>
                {confirmingUserDelete ? (
                  <>
                    <button className="btn btn-danger-solid btn-sm" onClick={deleteUser}>
                      <Trash2 size={14} /> Confirm Delete
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setConfirmingUserDelete(false)}>Cancel</button>
                  </>
                ) : (
                  <button className="btn btn-outline btn-sm admin-danger" disabled={!canDelete} onClick={deleteUser}><Trash2 size={14} /> Delete User</button>
                )}
              </div>
              {confirmingUserDelete && (
                <div className="admin-confirm-note">This permanently removes the account, profile and sessions.</div>
              )}

              <div className="divider" />

              <div className="form-group">
                <label>Reset User Password</label>
                <input
                  type="password"
                  placeholder="New password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
              <button className="btn btn-outline btn-sm" disabled={!canSecurity} onClick={resetUserPassword}><KeyRound size={14} /> Update Password</button>
            </>
          ) : (
            <p className="muted">Select a user to manage.</p>
          )}
        </div>

        <div className="card admin-editor-card">
          <h3>Profile Editor</h3>
          {editProfile ? (
            <>
              <div className="form-group"><label>Bio</label><textarea rows={3} value={editProfile.bio || ''} onChange={(e) => setEditProfile((p) => ({ ...p, bio: e.target.value }))} /></div>
              <div className="form-group"><label>Department</label><input value={editProfile.dept || ''} onChange={(e) => setEditProfile((p) => ({ ...p, dept: e.target.value }))} /></div>
              <div className="form-row">
                <div className="form-group"><label>USN</label><input value={editProfile.usn || ''} onChange={(e) => setEditProfile((p) => ({ ...p, usn: e.target.value }))} /></div>
                <div className="form-group"><label>Year</label><input value={editProfile.year || ''} onChange={(e) => setEditProfile((p) => ({ ...p, year: e.target.value }))} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>GitHub</label><input value={editProfile.github || ''} onChange={(e) => setEditProfile((p) => ({ ...p, github: e.target.value }))} /></div>
                <div className="form-group"><label>LinkedIn</label><input value={editProfile.linkedin || ''} onChange={(e) => setEditProfile((p) => ({ ...p, linkedin: e.target.value }))} /></div>
              </div>
              <button className="btn btn-lime btn-sm" disabled={!canEdit} onClick={saveProfile}><Save size={14} /> Save Profile</button>
            </>
          ) : (
            <p className="muted">No profile found for this user.</p>
          )}
        </div>

        <div className="card admin-audit-card">
          <h3>Recent Audit Logs</h3>
          <div className="admin-audit-list">
            {auditLogs.map((log) => (
              <div key={log.id} className="admin-audit-item">
                <div className="admin-audit-main">{formatAuditLine(log)}</div>
                {Object.keys(log.details || {}).length > 0 && (
                  <div className="admin-audit-sub">Details: {Object.entries(log.details).map(([key, value]) => `${key}: ${String(value)}`).join(', ')}</div>
                )}
                <div className="admin-audit-sub">Actor ID: {log.actorId}</div>
                <div className="admin-audit-sub">Target ID: {log.targetUserId || '-'}</div>
                <div className="admin-audit-sub">{new Date(log.createdAt).toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card admin-audit-card">
          <h3>Manage Posts</h3>
          <div className="admin-audit-list">
            {ideas.length === 0 ? (
              <div className="admin-audit-item">
                <div className="admin-audit-main">No posts found.</div>
              </div>
            ) : (
              ideas.map((idea) => (
                <div key={idea.id} className="admin-audit-item">
                  <div className="admin-audit-main">{idea.title}</div>
                  <div className="admin-audit-sub">Author: {idea.author?.name || 'User'} ({idea.author?.email || idea.authorId})</div>
                  <div className="admin-audit-sub">Type: {idea.type} · Team: {idea.teamSize}</div>
                  <div className="admin-audit-sub">Created: {new Date(idea.createdAt).toLocaleString()}</div>
                  {confirmingIdeaId === idea.id ? (
                    <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                      <button
                        className="btn btn-danger-solid btn-sm"
                        disabled={deletingIdeaId === idea.id}
                        onClick={() => deleteIdea(idea.id)}
                      >
                        <Trash2 size={13} /> {deletingIdeaId === idea.id ? 'Deleting...' : 'Confirm Delete'}
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setConfirmingIdeaId('')}>Cancel</button>
                    </div>
                  ) : (
                    <button
                      className="btn btn-outline btn-sm admin-danger"
                      style={{ marginTop: 8 }}
                      disabled={!canDeletePosts}
                      onClick={() => deleteIdea(idea.id)}
                    >
                      <Trash2 size={13} /> Delete Post
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, val, icon: Icon }) {
  return (
    <div className="card stat-card admin-stat-card">
      {Icon && <div className="stat-icon"><Icon size={17} /></div>}
      <div className="stat-val">{val}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
