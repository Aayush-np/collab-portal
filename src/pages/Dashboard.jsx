import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Users, Lightbulb, MessageSquare, Star, TrendingUp, ArrowRight, Zap } from 'lucide-react';
import { users } from '../data/mockData';
import { apiGet, apiPost } from '../services/api';
import ProjectCard from '../components/ProjectCard';
import { useModalBehavior } from '../hooks/useModalBehavior';
import { toast } from '../utils/toast';
import { timeAgo } from '../utils/time';
import './Dashboard.css';

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};

export default function Dashboard({ setPage, currentUser, accessToken, withAccessRetry, setViewingUserId, notifications = [], notificationUnreadCount = 0 }) {
  const [recentProjects, setRecentProjects] = useState([]);
  const [liveCounts, setLiveCounts] = useState({ ideasPosted: currentUser.projectsPosted || 0, connections: currentUser.collaborations || 0 });
  const [projectStatusMap, setProjectStatusMap] = useState({});
  const [selectedProject, setSelectedProject] = useState(null);
  const topMatches = users.slice(0, 3);
  const unreadCount = notificationUnreadCount;
  const topSkillProgress = (currentUser.skills || []).slice(0, 4).map((skill, i) => ({
    skill,
    pct: currentUser.skillLevels?.[skill] ?? Math.max(50, 80 - i * 5),
  }));

  useEffect(() => {
    if (!accessToken) {
      setRecentProjects([]);
      setLiveCounts({ ideasPosted: currentUser.projectsPosted || 0, connections: currentUser.collaborations || 0 });
      return undefined;
    }

    let cancelled = false;

    const loadAll = () => {
      Promise.all([
        withAccessRetry((token) => apiGet('/ideas', token)),
        withAccessRetry((token) => apiGet('/connections/summary', token)),
        withAccessRetry((token) => apiGet('/ideas/requests?type=outgoing', token)),
      ])
        .then(([ideasResult, connectionsResult, requestsResult]) => {
          if (cancelled) return;
          const ideas = ideasResult.ideas || [];
          const statusMap = {};
          (requestsResult.requests || []).forEach((request) => {
            statusMap[request.ideaId] = request.status;
          });
          setRecentProjects(ideas.slice(0, 3));
          setProjectStatusMap(statusMap);
          setLiveCounts({
            ideasPosted: ideas.filter((idea) => idea.authorId === currentUser.id).length,
            connections: connectionsResult.connectedCount || 0,
          });
        })
        .catch(() => {
          if (cancelled) return;
          setRecentProjects([]);
          setProjectStatusMap({});
          setLiveCounts({ ideasPosted: currentUser.projectsPosted || 0, connections: currentUser.collaborations || 0 });
        });
    };

    loadAll();

    // Realtime: refresh the feed when anyone posts/edits/deletes an idea.
    let refreshTimer = null;
    const onIdeasChanged = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        if (!cancelled) loadAll();
      }, 300);
    };
    window.addEventListener('ideas-changed', onIdeasChanged);

    return () => {
      cancelled = true;
      if (refreshTimer) clearTimeout(refreshTimer);
      window.removeEventListener('ideas-changed', onIdeasChanged);
    };
  }, [accessToken, currentUser.id]);

  const handleProjectView = (project) => {
    setSelectedProject(project);
  };

  useModalBehavior(Boolean(selectedProject), () => setSelectedProject(null));

  const applyToProject = async (project) => {
    const targetUserId = project.author?.id || project.authorId;
    if (!targetUserId || targetUserId === currentUser.id) return;

    try {
      await withAccessRetry((token) => apiPost(`/ideas/${project.id}/request`, {}, token));
      setProjectStatusMap((prev) => ({ ...prev, [project.id]: 'pending' }));
      toast('Application sent to the project owner.', 'success');
    } catch (e) {
      toast(e.message || 'Could not apply.', 'error');
    }
  };

  return (
    <div className="page-container dashboard">
      {/* Welcome Banner */}
      <div className="welcome-banner">
        <div className="welcome-text">
          <div className="welcome-greeting">{getGreeting()}, {(currentUser.name || '').split(' ')[0] || 'there'} 👋</div>
          <p className="muted">
            You have <span className="lime">{unreadCount} unread notifications</span> and
            <span className="lime"> {recentProjects.length}</span> active opportunities in your feed.
          </p>
        </div>
        <div className="welcome-actions">
          <button className="btn btn-lime" onClick={() => setPage('post')}>
            <Lightbulb size={16} /> Post an Idea
          </button>
          <button className="btn btn-outline" onClick={() => setPage('explore')}>
            <Users size={16} /> Find Collaborators
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid-4 stats-row">
        {[
          { icon: Lightbulb, val: liveCounts.ideasPosted, label: 'Ideas Posted', onClick: () => setPage('profile') },
          { icon: Users,     val: liveCounts.connections, label: 'Connections', onClick: () => { window.dispatchEvent(new CustomEvent('profile-open-tab', { detail: { tab: 'connections' } })); setPage('profile'); } },
          { icon: MessageSquare, val: unreadCount, label: 'Unread Notifications', onClick: () => setPage('messages') },
          { icon: Star, val: currentUser.matchScore ? `${currentUser.matchScore}%` : '--', label: 'Top Match Score', onClick: () => setPage('explore') },
        ].map(({ icon: Icon, val, label, onClick }, i) => (
          <button className="stat-card stat-btn" key={i} onClick={onClick}>
            <div className="stat-icon"><Icon size={18} /></div>
            <div className="stat-val">{val}</div>
            <div className="stat-label">{label}</div>
          </button>
        ))}
      </div>

      {/* Main Grid */}
      <div className="dashboard-grid">
        {/* Left: Recent projects */}
        <div className="dashboard-main">
          <div className="section-header">
            <h2>Trending Projects</h2>
            <button className="btn btn-ghost btn-sm" onClick={() => setPage('explore')}>
              View all <ArrowRight size={13} />
            </button>
          </div>
          <div className="projects-list">
            {recentProjects.length === 0 ? (
              <div className="card muted">No projects posted yet.</div>
            ) : (
              recentProjects.map((p) => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  currentUserId={currentUser.id}
                  onViewDetail={handleProjectView}
                  onApply={applyToProject}
                  requestStatus={projectStatusMap[p.id] || ''}
                />
              ))
            )}
          </div>
        </div>

        {/* Project Detail Modal */}
        <AnimatePresence>
        {selectedProject && (
          <motion.div
            className="project-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => setSelectedProject(null)}
          >
            <ProjectDetailModal
              project={selectedProject}
              currentUserId={currentUser.id}
              onClose={() => setSelectedProject(null)}
              onApply={applyToProject}
              requestStatus={projectStatusMap[selectedProject.id] || ''}
            />
          </motion.div>
        )}
        </AnimatePresence>

        {/* Right: Sidebar widgets */}
        <div className="dashboard-side">
          {/* Skill Match */}
          <div className="card widget">
            <div className="widget-title">
              <Zap size={16} className="lime" />
              Top Skill Matches
            </div>
            <div className="match-list">
              {topMatches.length === 0 ? (
                <div className="muted" style={{ fontSize: 12 }}>No collaborator suggestions yet.</div>
              ) : (
                topMatches.map(user => (
                  <div className="match-item" key={user.id} onClick={() => { setViewingUserId(user.id); setPage('profile'); }} style={{ cursor: 'pointer' }}>
                    <div className="avatar avatar-sm" style={{ background: 'var(--teal)', color: '#0a0f1c', fontWeight: 700, fontSize: 11 }}>
                      {user.initials}
                    </div>
                    <div className="match-info">
                      <div className="match-name">{user.name}</div>
                      <div className="match-skills muted">{user.skills.slice(0, 2).join(', ')}</div>
                    </div>
                    <div className="match-score">{user.matchScore}%</div>
                  </div>
                ))
              )}
            </div>
            <button className="btn btn-outline btn-sm full-width" style={{ marginTop: 12 }} onClick={() => setPage('explore')}>
              See all matches
            </button>
          </div>

          {/* Notifications */}
          <div className="card widget">
            <div className="widget-title">
              <Star size={16} className="lime" />
              Recent Activity
            </div>
            <div className="notif-list">
              {notifications.length === 0 ? (
                <div className="muted" style={{ fontSize: 12 }}>No recent activity.</div>
              ) : (
                notifications.slice(0, 6).map(n => (
                  <div className={`notif-item-row ${!n.read ? 'unread' : ''}`} key={n.id}>
                    <div className="notif-text">{n.text}</div>
                    <div className="notif-time muted">{timeAgo(n.createdAt)}</div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Skills Progress */}
          <div className="card widget">
            <div className="widget-title">
              <TrendingUp size={16} className="lime" />
              Your Top Skills
            </div>
            {topSkillProgress.length === 0 ? (
              <div className="muted" style={{ fontSize: 12 }}>Add skills in profile to track progress.</div>
            ) : (
              topSkillProgress.map(({ skill, pct }) => (
                <div className="skill-progress-row" key={skill}>
                  <div className="skill-progress-header">
                    <span className="skill-progress-name">{skill}</span>
                    <span className="muted" style={{ fontSize: 11 }}>{pct}%</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProjectDetailModal({ project, currentUserId, onClose, onApply, requestStatus }) {
  const teamSize = Number(project.teamSize || 1);
  const currentMembers = Number(project.currentMembers || 1);
  const spotsLeft = teamSize - currentMembers;
  const isOwner = Boolean(currentUserId) && (project.author?.id === currentUserId || project.authorId === currentUserId);
  const isRequested = requestStatus === 'pending';
  const isJoined = requestStatus === 'accepted';

  return (
    <motion.div
      className="project-modal card"
      initial={{ opacity: 0, scale: 0.95, y: 14 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, y: 8 }}
      transition={{ type: 'spring', bounce: 0.18, visualDuration: 0.35 }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{project.title}</h2>
            <span className={`badge ${project.status === 'Recruiting' ? 'badge-lime' : project.status === 'Open' ? 'badge-amber' : 'badge-white'}`}>
              {project.status}
            </span>
            {project.type === 'internship' && <span className="badge badge-amber">Internship</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <div className="avatar avatar-sm" style={{ background: 'var(--teal)', color: '#0a0f1c', fontWeight: 700, fontSize: 12 }}>
              {project.author?.initials || 'U'}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{project.author?.name || 'User'}</div>
              <div className="muted" style={{ fontSize: 11 }}>{project.author?.usn || ''} · {timeAgo(project.createdAt)}</div>
            </div>
          </div>
        </div>
        <button className="btn btn-outline btn-sm" onClick={onClose}>Close</button>
      </div>

      <p style={{ marginBottom: 12, lineHeight: 1.6 }}>{project.description}</p>

      {project.requirements && (
        <div style={{ marginBottom: 12 }}>
          <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Requirements</h4>
          <p className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>{project.requirements}</p>
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Skills Required</h4>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {(project.skills || []).map((s) => (
            <span key={s} className="skill-tag">{s}</span>
          ))}
        </div>
      </div>

      {(project.tags || []).length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Tags</h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {project.tags.map((t) => (
              <span key={t} className="badge badge-teal">{t}</span>
            ))}
          </div>
        </div>
      )}

      <div className="divider" />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 20 }}>
          <div>
            <div className="muted" style={{ fontSize: 11 }}>Team Members</div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{currentMembers}/{teamSize}</div>
            {spotsLeft > 0 && <div className="muted" style={{ fontSize: 10 }}>{spotsLeft} spot{spotsLeft > 1 ? 's' : ''} left</div>}
          </div>
          {project.deadline && (
            <div>
              <div className="muted" style={{ fontSize: 11 }}>Deadline</div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{project.deadline}</div>
            </div>
          )}
          {project.github && (
            <div>
              <div className="muted" style={{ fontSize: 11 }}>GitHub</div>
              <a href={`https://${project.github}`} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--lime)' }}>{project.github}</a>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {!isOwner && (
          <button
            className="btn btn-lime btn-sm"
            onClick={() => {
              if (!isRequested && !isJoined) {
                onApply?.(project);
              }
              onClose();
            }}
            disabled={isRequested || isJoined}
          >
            {isJoined ? 'Joined' : isRequested ? 'Requested' : 'Apply Now'}
          </button>
        )}
        <button className="btn btn-outline btn-sm" onClick={onClose}>Close</button>
      </div>
    </motion.div>
  );
}
