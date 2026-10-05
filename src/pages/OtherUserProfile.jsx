import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Mail, BookOpen, Star, Github, Linkedin, Lightbulb, ArrowLeft } from 'lucide-react';
import { apiGet, apiPost } from '../services/api';
import ProjectCard from '../components/ProjectCard';
import { useModalBehavior } from '../hooks/useModalBehavior';
import { toast } from '../utils/toast';
import { timeAgo } from '../utils/time';
import './Profile.css';

export default function OtherUserProfile({ userId, setPage, currentUser, accessToken, withAccessRetry, onBack }) {
  const [user, setUser] = useState(null);
  const [userIdeas, setUserIdeas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [projectStatusMap, setProjectStatusMap] = useState({});
  const [selectedProject, setSelectedProject] = useState(null);

  useModalBehavior(Boolean(selectedProject), () => setSelectedProject(null));

  useEffect(() => {
    if (!accessToken || !userId) {
      setLoading(false);
      return;
    }

    Promise.all([
      withAccessRetry((token) => apiGet('/ideas', token)),
      withAccessRetry((token) => apiGet('/messages/users?q=', token)),
      withAccessRetry((token) => apiGet('/ideas/requests?type=outgoing', token)),
    ])
      .then(([ideasResult, usersResult, requestsResult]) => {
        // Find the user
        const foundUser = (usersResult.users || []).find((u) => u.id === userId);
        if (foundUser) {
          setUser(foundUser);
        }

        // Filter ideas posted by this user
        const ideas = (ideasResult.ideas || []).filter((idea) => idea.authorId === userId);
        setUserIdeas(ideas);

        // Map request statuses
        const statusMap = {};
        (requestsResult.requests || []).forEach((request) => {
          statusMap[request.ideaId] = request.status;
        });
        setProjectStatusMap(statusMap);

        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [accessToken, userId, withAccessRetry]);

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

  if (loading) {
    return (
      <div className="page-container">
        <div className="muted" style={{ textAlign: 'center', padding: '60px 20px' }}>Loading profile...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="page-container">
        <div className="muted" style={{ textAlign: 'center', padding: '60px 20px' }}>User not found.</div>
        <button className="btn btn-outline" onClick={onBack}><ArrowLeft size={14} /> Back</button>
      </div>
    );
  }

  const profileInitials = (user.name || '').split(/\s+/).filter(Boolean).slice(0, 2).map((n) => n[0]).join('').toUpperCase();

  return (
    <div className="page-container">
      {/* Back Button */}
      <button className="btn btn-outline btn-sm" onClick={onBack} style={{ marginBottom: 16 }}>
        <ArrowLeft size={14} /> Back to Explore
      </button>

      {/* Profile Header Card */}
      <div className="profile-header card">
        <div className="profile-cover" style={{ backgroundImage: user.banner ? `url(${user.banner})` : undefined }} />

        <div className="profile-header-body">
          <div className="profile-avatar-row">
            <div className="avatar avatar-xl profile-avatar" style={!user.avatar ? { background: 'var(--teal)', color: '#0a0f1c', fontWeight: 900, fontSize: 36 } : undefined}>
              {user.avatar ? (
                <img src={user.avatar} alt={`${user.name} profile`} className="profile-avatar-img" />
              ) : (
                profileInitials
              )}
            </div>
            <div className="profile-header-actions">
              <button className="btn btn-outline btn-sm" onClick={onBack}>
                Close Profile
              </button>
            </div>
          </div>

          <div className="profile-info">
            <div className="profile-name-row">
              <h1 className="profile-name">{user.name}</h1>
              {user.usn && <span className="badge badge-lime mono">{user.usn}</span>}
            </div>
            <div className="profile-meta">
              <span><BookOpen size={13} /> {user.dept || 'Student'}</span>
              <span><Star size={13} /> {user.year || 'N/A'}</span>
              <span><Mail size={13} /> {user.email}</span>
            </div>
            <p className="profile-bio">{user.bio || 'No bio added yet.'}</p>
            {(user.github || user.linkedin) && (
              <div className="profile-links">
                {user.github && (
                  <a href={`https://${user.github}`} target="_blank" rel="noreferrer" className="profile-link">
                    <Github size={14} /> {user.github}
                  </a>
                )}
                {user.linkedin && (
                  <a href={`https://${user.linkedin}`} target="_blank" rel="noreferrer" className="profile-link">
                    <Linkedin size={14} /> {user.linkedin}
                  </a>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="profile-stats-row">
          {[
            { icon: Lightbulb, val: userIdeas.length, label: 'Projects Posted' },
            { icon: Mail, val: user.skills?.length || 0, label: 'Skills' },
          ].map(({ icon: Icon, val, label }) => (
            <div className="profile-stat" key={label}>
              <Icon size={15} className="lime" />
              <span className="profile-stat-val">{val}</span>
              <span className="profile-stat-label muted">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Skills & Interests */}
      {(user.skills?.length > 0 || user.interests?.length > 0) && (
        <div className="grid-2" style={{ marginBottom: 24 }}>
          {user.skills?.length > 0 && (
            <div className="card">
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Skills</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {user.skills.map((s) => (
                  <span key={s} className="skill-tag active">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {user.interests?.length > 0 && (
            <div className="card">
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Interests</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {user.interests.map((i) => (
                  <span key={i} className="badge badge-teal" style={{ fontSize: 12, padding: '5px 12px' }}>
                    {i}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Posted Projects */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Projects Posted by {user.name}</h2>
          <span className="badge badge-lime">{userIdeas.length}</span>
        </div>
        {userIdeas.length === 0 ? (
          <div className="card muted">This user hasn't posted any projects yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {userIdeas.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                currentUserId={currentUser.id}
                onViewDetail={() => setSelectedProject(p)}
                onApply={applyToProject}
                requestStatus={projectStatusMap[p.id] || ''}
              />
            ))}
          </div>
        )}
      </div>

      {/* Project Detail Modal */}
      <AnimatePresence>
      {selectedProject && (
        <motion.div className="project-modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} onClick={() => setSelectedProject(null)}>
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
