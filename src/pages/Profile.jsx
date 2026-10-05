import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Edit3, Save, X, Plus, Github, Linkedin,
  Mail, BookOpen, Star, Users, Lightbulb,
  ExternalLink, Award, Zap, Trash2, ArrowRight, Heart
} from 'lucide-react';
import { allSkills } from '../data/mockData';
import { apiDelete, apiGet } from '../services/api';
import { openChatWithUser } from '../utils/chatActions';
import { useModalBehavior } from '../hooks/useModalBehavior';
import { toast } from '../utils/toast';
import { timeAgo } from '../utils/time';
import './Profile.css';

const clampPct = (val) => {
  const n = Number(val);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
};

const toInitials = (name) => {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
};

const withSkillLevels = (user) => {
  const skills = Array.isArray(user.skills) ? user.skills : [];
  const inputLevels = user.skillLevels || {};
  return {
    ...user,
    skills,
    interests: Array.isArray(user.interests) ? user.interests : [],
    skillLevels: Object.fromEntries(
      skills.map((skill, i) => [
        skill,
        clampPct(inputLevels[skill] ?? Math.max(50, 80 - i * 5)),
      ])
    ),
  };
};

const fileToDataUrl = (file, { maxWidth, maxHeight, quality = 0.86 } = {}) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error('Could not read the selected file.'));
  reader.onload = () => {
    const img = new Image();
    img.onerror = () => reject(new Error('Unsupported image file.'));
    img.onload = () => {
      const ratio = Math.min(1, maxWidth / img.width, maxHeight / img.height);
      const width = Math.max(1, Math.round(img.width * ratio));
      const height = Math.max(1, Math.round(img.height * ratio));

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not process image.'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
      resolve(canvas.toDataURL(mime, quality));
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
});

export default function Profile({ setPage, currentUser, setCurrentUser, accessToken, withAccessRetry }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(withSkillLevels({ ...currentUser }));
  const [newSkill, setNewSkill] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [uploadingField, setUploadingField] = useState('');
  const [myProjects, setMyProjects] = useState([]);
  const [collaboratedProjects, setCollaboratedProjects] = useState([]);
  const [connectedPeople, setConnectedPeople] = useState([]);
  const [deletingIdeaId, setDeletingIdeaId] = useState('');
  const [selectedProject, setSelectedProject] = useState(null);
  const avatarInputRef = useRef(null);
  const bannerInputRef = useRef(null);

  useModalBehavior(Boolean(selectedProject), () => setSelectedProject(null));

  useEffect(() => {
    if (!accessToken || !currentUser?.id) {
      setMyProjects([]);
      setCollaboratedProjects([]);
      return;
    }

    withAccessRetry((token) => apiGet('/ideas', token))
      .then((result) => {
        const allIdeas = result.ideas || [];
        const mine = allIdeas.filter((idea) => idea.author?.id === currentUser.id || idea.authorId === currentUser.id);
        const collaborations = allIdeas.filter((idea) => {
          const isMine = idea.author?.id === currentUser.id || idea.authorId === currentUser.id;
          const collaboratorIds = Array.isArray(idea.collaboratorIds) ? idea.collaboratorIds : [];
          return !isMine && collaboratorIds.includes(currentUser.id);
        });
        setMyProjects(mine);
        setCollaboratedProjects(collaborations);
      })
      .catch(() => {
        setMyProjects([]);
        setCollaboratedProjects([]);
      });
  }, [accessToken, currentUser?.id]);

  useEffect(() => {
    if (!accessToken) {
      setConnectedPeople([]);
      return;
    }

    withAccessRetry((token) => apiGet('/connections/connected', token))
      .then((result) => setConnectedPeople(result.people || []))
      .catch(() => setConnectedPeople([]));
  }, [accessToken]);

  useEffect(() => {
    const handler = (event) => {
      const tab = event.detail?.tab;
      if (!tab) return;
      setActiveTab(tab);
    };

    window.addEventListener('profile-open-tab', handler);
    return () => window.removeEventListener('profile-open-tab', handler);
  }, []);

  useEffect(() => {
    const handler = () => {
      if (!accessToken) return;
      withAccessRetry((token) => apiGet('/connections/connected', token))
        .then((result) => setConnectedPeople(result.people || []))
        .catch(() => {});
    };

    window.addEventListener('connections-changed', handler);
    return () => window.removeEventListener('connections-changed', handler);
  }, [accessToken]);

  const deleteMyProject = async (ideaId) => {
    if (!ideaId) return;
    setDeletingIdeaId(ideaId);
    try {
      await withAccessRetry((token) => apiDelete(`/ideas/${ideaId}`, token));
      setMyProjects((prev) => prev.filter((item) => item.id !== ideaId));
      toast('Project deleted.', 'success');
    } catch (e) {
      toast(e.message || 'Could not delete project.', 'error');
    } finally {
      setDeletingIdeaId('');
    }
  };

  const startEdit = () => { setDraft(withSkillLevels({ ...currentUser })); setEditing(true); };
  const cancelEdit = () => setEditing(false);
  const saveEdit = () => {
    const normalized = withSkillLevels({ ...draft, initials: toInitials(draft.name) || currentUser.initials });
    setCurrentUser(normalized);
    setEditing(false);
    toast('Profile updated.', 'success');
  };

  const setDraftField = (k, v) => setDraft(d => ({ ...d, [k]: v }));

  const addSkill = () => {
    const s = newSkill.trim();
    const currentSkills = Array.isArray(draft.skills) ? draft.skills : [];
    if (s && !currentSkills.includes(s)) {
      setDraft(d => ({
        ...d,
        skills: [...currentSkills, s],
        skillLevels: { ...d.skillLevels, [s]: 60 },
      }));
    }
    setNewSkill('');
  };
  const removeSkill = (s) => setDraft(d => {
    const currentSkills = Array.isArray(d.skills) ? d.skills : [];
    const nextLevels = { ...(d.skillLevels || {}) };
    delete nextLevels[s];
    return {
      ...d,
      skills: currentSkills.filter(x => x !== s),
      skillLevels: nextLevels,
    };
  });
  const setSkillPct = (skill, value) => setDraft(d => ({
    ...d,
    skillLevels: {
      ...(d.skillLevels || {}),
      [skill]: clampPct(value),
    },
  }));

  const updateImage = async (field, event) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    if (file.size > 5 * 1024 * 1024) return;

    setUploadingField(field);
    try {
      const optimized = await fileToDataUrl(
        file,
        field === 'banner'
          ? { maxWidth: 1600, maxHeight: 600, quality: 0.84 }
          : { maxWidth: 420, maxHeight: 420, quality: 0.9 }
      );
      setDraftField(field, optimized);
    } finally {
      setUploadingField('');
    }
  };

  const profileForDisplay = editing ? draft : withSkillLevels(currentUser);
  const profileInitials = toInitials(profileForDisplay.name) || currentUser.initials;

  return (
    <div className="page-container">
      {/* Profile Header Card */}
      <div className="profile-header card">
        {/* Cover strip */}
        <div
          className="profile-cover"
          style={profileForDisplay.banner ? { backgroundImage: `url(${profileForDisplay.banner})` } : undefined}
        >
          {editing && (
            <button
              className="btn btn-outline btn-sm cover-upload-btn"
              onClick={() => bannerInputRef.current?.click()}
            >
              {uploadingField === 'banner' ? 'Uploading...' : 'Update Banner'}
            </button>
          )}
          <input
            ref={bannerInputRef}
            type="file"
            accept="image/*"
            className="hidden-file-input"
            onChange={(e) => updateImage('banner', e)}
          />
        </div>

        <div className="profile-header-body">
          <div className="profile-avatar-row">
            <div className="avatar avatar-xl profile-avatar" style={!profileForDisplay.avatar ? { background: 'linear-gradient(135deg, var(--lime), var(--lime-dim))', color: 'var(--lime-ink)', fontWeight: 900, fontSize: 36 } : undefined}>
              {profileForDisplay.avatar ? (
                <img src={profileForDisplay.avatar} alt={`${profileForDisplay.name} profile`} className="profile-avatar-img" />
              ) : (
                profileInitials
              )}
              {editing && (
                <button
                  className="avatar-upload-btn"
                  onClick={() => avatarInputRef.current?.click()}
                  aria-label="Update profile picture"
                >
                  {uploadingField === 'avatar' ? '...' : <Edit3 size={12} />}
                </button>
              )}
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden-file-input"
                onChange={(e) => updateImage('avatar', e)}
              />
            </div>
            <div className="profile-header-actions">
              {!editing ? (
                <button className="btn btn-outline btn-sm" onClick={startEdit}>
                  <Edit3 size={14} /> Edit Profile
                </button>
              ) : (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-lime btn-sm" onClick={saveEdit}>
                    <Save size={14} /> Save
                  </button>
                  <button className="btn btn-outline btn-sm" onClick={cancelEdit}>
                    <X size={14} /> Cancel
                  </button>
                </div>
              )}
            </div>
          </div>

          {!editing ? (
            <div className="profile-info">
              <div className="profile-name-row">
                <h1 className="profile-name">{currentUser.name}</h1>
                {currentUser.usn && <span className="badge badge-lime mono">{currentUser.usn}</span>}
              </div>
              <div className="profile-meta">
                <span><BookOpen size={13} /> {currentUser.dept}</span>
                <span><Star size={13} /> {currentUser.year}</span>
                <span><Mail size={13} /> {currentUser.email}</span>
              </div>
              <p className="profile-bio">{currentUser.bio}</p>
              <div className="profile-links">
                {currentUser.github && (
                  <a href={`https://${currentUser.github}`} target="_blank" rel="noreferrer" className="profile-link">
                    <Github size={14} /> {currentUser.github}
                  </a>
                )}
                {currentUser.linkedin && (
                  <a href={`https://${currentUser.linkedin}`} target="_blank" rel="noreferrer" className="profile-link">
                    <Linkedin size={14} /> {currentUser.linkedin}
                  </a>
                )}
              </div>
            </div>
          ) : (
            <div className="profile-edit-form">
              <div className="form-row">
                <div className="form-group">
                  <label>Full Name</label>
                  <input value={draft.name} onChange={e => setDraftField('name', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>USN</label>
                  <input value={draft.usn} onChange={e => setDraftField('usn', e.target.value)} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Email</label>
                  <input type="email" value={draft.email} onChange={e => setDraftField('email', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Year</label>
                  <select value={draft.year} onChange={e => setDraftField('year', e.target.value)}>
                    {['1st Year','2nd Year','3rd Year','4th Year'].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Bio</label>
                <textarea rows={3} value={draft.bio} onChange={e => setDraftField('bio', e.target.value)} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>GitHub</label>
                  <input placeholder="github.com/username" value={draft.github} onChange={e => setDraftField('github', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>LinkedIn</label>
                  <input placeholder="linkedin.com/in/username" value={draft.linkedin} onChange={e => setDraftField('linkedin', e.target.value)} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="profile-stats-row">
          {[
            { icon: Lightbulb, val: myProjects.length, label: 'Projects Posted', onClick: () => setActiveTab('projects') },
            { icon: Users,     val: connectedPeople.length, label: 'Connections', onClick: () => setActiveTab('connections') },
            {
              icon: Award,
              val: currentUser.matchScore ? `${currentUser.matchScore}%` : '--',
              label: 'Top Match',
              onClick: () => {
                window.dispatchEvent(new CustomEvent('open-people-view'));
                setPage('explore');
              },
            },
            { icon: Zap,       val: (currentUser.skills || []).length,  label: 'Skills Listed', onClick: () => setActiveTab('skills') },
          ].map(({ icon: Icon, val, label, onClick }) => (
            <button className="profile-stat profile-stat-btn" key={label} onClick={onClick}>
              <Icon size={15} className="lime" />
              <span className="profile-stat-val">{val}</span>
              <span className="profile-stat-label muted">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="profile-tabs">
        {['overview', 'projects', 'skills', 'connections'].map(tab => (
          <button
            key={tab}
            className={`profile-tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="profile-tab-content grid-2 anim-fade">
          {/* Skills Card */}
          <div className="card">
            <div className="section-header" style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700 }}>Skills</h3>
              {editing && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    style={{ width: 130 }}
                    placeholder="Add skill..."
                    value={newSkill}
                    onChange={e => setNewSkill(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addSkill()}
                    list="profile-skills-list"
                  />
                  <datalist id="profile-skills-list">
                    {allSkills.map(s => <option key={s} value={s} />)}
                  </datalist>
                  <button className="btn btn-lime btn-sm" onClick={addSkill}><Plus size={13} /></button>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {(profileForDisplay.skills || []).map(s => (
                <span key={s} className={`skill-tag ${editing ? 'removable' : 'active'}`}>
                  {s}
                  {editing && (
                    <button className="remove-skill-btn" onClick={() => removeSkill(s)}><X size={10} /></button>
                  )}
                </span>
              ))}
            </div>
          </div>

          {/* Interests Card */}
          <div className="card">
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Interests</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {(currentUser.interests || []).map(i => (
                <span key={i} className="badge badge-teal" style={{ fontSize: 12, padding: '5px 12px' }}>{i}</span>
              ))}
            </div>

            <div className="divider" />

            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Skill Proficiency</h3>
            {(profileForDisplay.skills || []).map((skill, i) => {
              const pct = profileForDisplay.skillLevels?.[skill] ?? Math.max(50, 80 - i * 5);
              return (
              <div key={skill} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--off-white)' }}>{skill}</span>
                  {editing ? (
                      <div className="skill-slider-wrap">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={pct}
                          className="skill-slider"
                          onChange={e => setSkillPct(skill, e.target.value)}
                        />
                        <span className="skill-slider-value">{pct}%</span>
                      </div>
                  ) : (
                    <span className="muted" style={{ fontSize: 11 }}>{pct}%</span>
                  )}
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );})}
          </div>
        </div>
      )}

      {activeTab === 'projects' && (
        <div className="anim-fade">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700 }}>Projects</h3>
            <button className="btn btn-lime btn-sm" onClick={() => setPage('post')}>
              <Plus size={14} /> Post New Idea
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            <section>
              <div className="section-header" style={{ marginBottom: 12 }}>
                <h4 style={{ fontSize: 14, fontWeight: 700 }}>Projects You Posted</h4>
                <span className="badge badge-lime">{myProjects.length}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {myProjects.length === 0 ? (
                  <div className="card muted">No projects posted yet.</div>
                ) : (
                  myProjects.map((p) => (
                    <ProfileProjectRow
                      key={p.id}
                      project={p}
                      roleLabel="Posted by you"
                      onDelete={() => deleteMyProject(p.id)}
                      onEdit={() => window.dispatchEvent(new CustomEvent('idea-edit-request', { detail: { idea: p } }))}
                      onView={() => setSelectedProject(p)}
                      deleting={deletingIdeaId === p.id}
                      showActions
                    />
                  ))
                )}
              </div>
            </section>

            <section>
              <div className="section-header" style={{ marginBottom: 12 }}>
                <h4 style={{ fontSize: 14, fontWeight: 700 }}>Projects You Collaborated On</h4>
                <span className="badge badge-teal">{collaboratedProjects.length}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {collaboratedProjects.length === 0 ? (
                  <div className="card muted">No collaborations yet.</div>
                ) : (
                  collaboratedProjects.map((p) => (
                    <ProfileProjectRow
                      key={p.id}
                      project={p}
                      roleLabel="Collaborating"
                      onView={() => setSelectedProject(p)}
                      showActions={false}
                    />
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      )}

      {activeTab === 'skills' && (
        <div className="anim-fade">
          <div className="card">
            <div className="section-header" style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700 }}>Your Skills</h3>
              {editing && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    style={{ width: 170 }}
                    placeholder="Add skill..."
                    value={newSkill}
                    onChange={(e) => setNewSkill(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addSkill()}
                    list="profile-skills-list-2"
                  />
                  <datalist id="profile-skills-list-2">
                    {allSkills.map((s) => <option key={s} value={s} />)}
                  </datalist>
                  <button className="btn btn-lime btn-sm" onClick={addSkill}><ArrowRight size={13} /></button>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {(profileForDisplay.skills || []).length === 0 ? (
                <div className="muted">No skills added yet.</div>
              ) : (
                (profileForDisplay.skills || []).map((s) => (
                  <span key={s} className={`skill-tag ${editing ? 'removable' : 'active'}`}>
                    {s}
                    {editing && (
                      <button className="remove-skill-btn" onClick={() => removeSkill(s)}><X size={10} /></button>
                    )}
                  </span>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'connections' && (
        <div className="anim-fade">
          <div className="card">
            <div className="section-header" style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700 }}>Connected People</h3>
              <span className="badge badge-lime">{connectedPeople.length}</span>
            </div>
            {connectedPeople.length === 0 ? (
              <div className="muted">No connections yet. Use Explore to send requests.</div>
            ) : (
              <div className="profile-connections-list">
                {connectedPeople.map((person) => (
                  <div className="profile-connection-item" key={person.id}>
                    <div className="profile-connection-user">
                      <div className="avatar avatar-sm profile-connection-avatar">{person.initials || 'U'}</div>
                      <div>
                        <div className="profile-connection-name">{person.name}</div>
                        <div className="muted" style={{ fontSize: 11 }}>{person.email || ''}</div>
                      </div>
                    </div>
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => {
                        openChatWithUser({ userId: person.id, setPage });
                      }}
                    >
                      <ExternalLink size={13} /> Message
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Project Detail Modal */}
      <AnimatePresence>
      {selectedProject && (
        <motion.div className="project-modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} onClick={() => setSelectedProject(null)}>
          <ProjectDetailModal
            project={selectedProject}
            currentUserId={currentUser.id}
            onClose={() => setSelectedProject(null)}
          />
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}

function ProjectDetailModal({ project, currentUserId, onClose }) {
  const teamSize = Number(project.teamSize || 1);
  const currentMembers = Number(project.currentMembers || 1);
  const spotsLeft = teamSize - currentMembers;
  const isOwner = Boolean(currentUserId) && (project.author?.id === currentUserId || project.authorId === currentUserId);

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

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-outline btn-sm" onClick={onClose}>Close</button>
      </div>
    </motion.div>
  );
}

function ProfileProjectRow({ project, onDelete, onEdit, onView, deleting, showActions = true, roleLabel }) {
  const spotsLeft = project.teamSize - project.currentMembers;
  return (
    <div className="card profile-project-row">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <h4 style={{ fontSize: 15, fontWeight: 700 }}>{project.title}</h4>
            <span className={`badge ${project.status === 'Recruiting' ? 'badge-lime' : project.status === 'Open' ? 'badge-amber' : 'badge-white'}`}>
              {project.status}
            </span>
            {roleLabel && <span className="badge badge-teal">{roleLabel}</span>}
          </div>
          <p className="muted" style={{ fontSize: 13 }}>{String(project.description || '').slice(0, 110)}...</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            {(project.skills || []).slice(0, 4).map(s => <span key={s} className="skill-tag">{s}</span>)}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end', flexShrink: 0 }}>
          <div className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <Users size={12} /> {project.currentMembers}/{project.teamSize} · <Heart size={12} /> {project.likes}
          </div>
          {spotsLeft > 0 && <span className="muted" style={{ fontSize: 11 }}>{spotsLeft} spots open</span>}
          {showActions && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button className="btn btn-outline btn-sm" onClick={() => onView?.(project)}>
                <ArrowRight size={13} /> View
              </button>
              <button className="btn btn-outline btn-sm" onClick={onEdit}>
                <Edit3 size={13} /> Edit
              </button>
              <button className="btn btn-outline btn-sm admin-danger" onClick={onDelete} disabled={deleting}>
                <Trash2 size={13} /> {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          )}
          {!showActions && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button className="btn btn-outline btn-sm" onClick={() => onView?.(project)}>
                <ArrowRight size={13} /> View
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
