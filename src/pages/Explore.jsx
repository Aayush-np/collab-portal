import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Search, Filter, Users, Code, Briefcase, SlidersHorizontal, SearchX } from 'lucide-react';
import { allSkills, allTags } from '../data/mockData';
import { apiGet, apiPost } from '../services/api';
import ProjectCard from '../components/ProjectCard';
import { openChatWithUser } from '../utils/chatActions';
import { useModalBehavior } from '../hooks/useModalBehavior';
import { toast } from '../utils/toast';
import { timeAgo } from '../utils/time';
import './Explore.css';

export default function Explore({ setPage, currentUser, accessToken, withAccessRetry, setViewingUserId }) {
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [selectedProject, setSelectedProject] = useState(null);
  const [connectionSummary, setConnectionSummary] = useState({
    connectedUserIds: [],
    outgoingToUserIds: [],
    incomingFromUserIds: [],
  });
  const [requestingUserId, setRequestingUserId] = useState('');
  const [projectStatusMap, setProjectStatusMap] = useState({});
  const [view, setView] = useState('projects'); // projects | people
  const [searchQ, setSearchQ] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [selectedSkills, setSelectedSkills] = useState([]);
  const [selectedTag, setSelectedTag] = useState('');
  const [showFilters, setShowFilters] = useState(true);

  useEffect(() => {
    if (!accessToken) {
      setProjects([]);
      setUsers([]);
      return undefined;
    }

    let cancelled = false;

    const loadAll = () => {
      Promise.all([
        withAccessRetry((token) => apiGet('/ideas', token)),
        withAccessRetry((token) => apiGet('/messages/users?q=', token)),
        withAccessRetry((token) => apiGet('/connections/summary', token)),
        withAccessRetry((token) => apiGet('/ideas/requests?type=outgoing', token)),
      ])
        .then(([ideasResult, usersResult, connectionsResult, projectRequestsResult]) => {
          if (cancelled) return;
          setProjects(ideasResult.ideas || []);
          const statusMap = {};
          (projectRequestsResult.requests || []).forEach((request) => {
            statusMap[request.ideaId] = request.status;
          });
          setProjectStatusMap(statusMap);
          setUsers((usersResult.users || []).map((u) => ({
            id: u.id,
            name: u.name,
            email: u.email,
            initials: u.initials,
            avatar: u.avatar,
            skills: u.skills || [],
            usn: u.usn || '',
            dept: u.dept || 'Student',
            year: u.year || '',
            bio: u.bio || '',
            projectsPosted: 0,
            collaborations: 0,
            matchScore: u.matchScore,
          })));
          setConnectionSummary({
            connectedUserIds: connectionsResult.connectedUserIds || [],
            outgoingToUserIds: connectionsResult.outgoingToUserIds || [],
            incomingFromUserIds: connectionsResult.incomingFromUserIds || [],
          });
        })
        .catch(() => {
          if (cancelled) return;
          setProjects([]);
          setUsers([]);
          setProjectStatusMap({});
          setConnectionSummary({
            connectedUserIds: [],
            outgoingToUserIds: [],
            incomingFromUserIds: [],
          });
        });
    };

    loadAll();

    // Realtime: anyone posts/edits/deletes an idea -> refresh without a page reload.
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
  }, [accessToken]);

  const sendConnectionRequest = async (userId) => {
    if (!userId || requestingUserId) return;
    setRequestingUserId(userId);
    try {
      await withAccessRetry((token) => apiPost('/connections/request', { toUserId: userId }, token));
      setConnectionSummary((prev) => ({
        ...prev,
        outgoingToUserIds: Array.from(new Set([...(prev.outgoingToUserIds || []), userId])),
      }));
      window.dispatchEvent(new CustomEvent('connections-changed'));
      toast('Connection request sent.', 'success');
    } catch (e) {
      toast(e.message || 'Could not send request.', 'error');
    } finally {
      setRequestingUserId('');
    }
  };

  const applyToProject = (project) => {
    const targetUserId = project.author?.id || project.authorId;
    if (!targetUserId || targetUserId === currentUser.id) return;

    withAccessRetry((token) => apiPost(`/ideas/${project.id}/request`, {}, token))
      .then(() => {
        setProjectStatusMap((prev) => ({ ...prev, [project.id]: 'pending' }));
        toast('Application sent to the project owner.', 'success');
      })
      .catch((e) => toast(e.message || 'Could not apply.', 'error'));
  };

  const viewOwnProject = (project) => {
    setSelectedProject(project);
  };

  useModalBehavior(Boolean(selectedProfile || selectedProject), () => {
    setSelectedProfile(null);
    setSelectedProject(null);
  });

  useEffect(() => {
    const handler = (event) => {
      const q = event.detail?.query || '';
      setView('projects');
      setSearchQ(q);
      setTypeFilter('all');
      setSelectedTag('');
      setSelectedSkills([]);
    };

    window.addEventListener('open-project-from-search', handler);
    return () => window.removeEventListener('open-project-from-search', handler);
  }, []);

  useEffect(() => {
    const handler = () => {
      setView('people');
      setTypeFilter('all');
      setSelectedTag('');
    };

    window.addEventListener('open-people-view', handler);
    return () => window.removeEventListener('open-people-view', handler);
  }, []);

  // Filter projects
  const filteredProjects = projects.filter(p => {
    const matchSearch = !searchQ || (p.title || '').toLowerCase().includes(searchQ.toLowerCase()) || (p.description || '').toLowerCase().includes(searchQ.toLowerCase());
    const matchType = typeFilter === 'all' || p.type === typeFilter;
    const matchSkills = selectedSkills.length === 0 || selectedSkills.some(s => (p.skills || []).includes(s));
    const matchTag = !selectedTag || (p.tags || []).includes(selectedTag);
    return matchSearch && matchType && matchSkills && matchTag;
  });

  // Filter people
  const filteredUsers = users.filter(u => {
    const q = searchQ.toLowerCase();
    const matchSearch = !searchQ
      || (u.name || '').toLowerCase().includes(q)
      || (u.email || '').toLowerCase().includes(q);
    const matchSkills = selectedSkills.length === 0 || selectedSkills.some(s => (u.skills || []).includes(s));
    return matchSearch && matchSkills;
  });

  const toggleSkill = (s) => {
    setSelectedSkills(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Explore</h1>
        <p>Find projects to join or teammates to collaborate with</p>
      </div>

      {/* Search & View Toggle */}
      <div className="explore-toolbar">
        <div className="explore-search">
          <Search size={15} />
          <input
            placeholder={view === 'projects' ? 'Search projects, skills, tags...' : 'Search students, skills...'}
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
          />
        </div>
        <div className="view-tabs">
          <button className={`view-tab ${view === 'projects' ? 'active' : ''}`} onClick={() => setView('projects')}>
            <Code size={15} /> Projects
            <span className="tab-count">{filteredProjects.length}</span>
          </button>
          <button className={`view-tab ${view === 'people' ? 'active' : ''}`} onClick={() => setView('people')}>
            <Users size={15} /> People
            <span className="tab-count">{filteredUsers.length}</span>
          </button>
        </div>
        <button className={`btn btn-outline btn-sm ${showFilters ? 'active-filter' : ''}`} onClick={() => setShowFilters(v => !v)}>
          <SlidersHorizontal size={14} /> Filters
        </button>
      </div>

      <div className="explore-layout">
        {/* Filters Panel */}
        {showFilters && (
          <aside className="filters-panel card anim-fade">
            <div className="filter-section">
              <div className="filter-label"><Filter size={13} /> Type</div>
              <div className="filter-options">
                {['all', 'project', 'internship'].map(t => (
                  <button
                    key={t}
                    className={`filter-chip ${typeFilter === t ? 'active' : ''}`}
                    onClick={() => setTypeFilter(t)}
                  >
                    {t === 'all' ? 'All' : t === 'project' ? 'Projects' : 'Internships'}
                  </button>
                ))}
              </div>
            </div>

            <div className="filter-section">
              <div className="filter-label"><Code size={13} /> Skills</div>
              <div className="filter-options skills-filter">
                {allSkills.slice(0, 16).map(s => (
                  <button
                    key={s}
                    className={`skill-tag ${selectedSkills.includes(s) ? 'active' : ''}`}
                    onClick={() => toggleSkill(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
              {selectedSkills.length > 0 && (
                <button className="btn btn-ghost btn-sm" onClick={() => setSelectedSkills([])}>
                  Clear skills
                </button>
              )}
            </div>

            {view === 'projects' && (
              <div className="filter-section">
                <div className="filter-label"><Briefcase size={13} /> Tags</div>
                <div className="filter-options">
                  {['', ...allTags.slice(0, 10)].map(t => (
                    <button
                      key={t || 'all'}
                      className={`filter-chip ${selectedTag === t ? 'active' : ''}`}
                      onClick={() => setSelectedTag(t)}
                    >
                      {t || 'All'}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </aside>
        )}

        {/* Results */}
        <div className="explore-results">
          {view === 'projects' && (
            <>
              <div className="results-info muted">
                Showing <strong style={{ color: 'var(--white)' }}>{filteredProjects.length}</strong> projects
              </div>
              {filteredProjects.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon"><SearchX size={40} /></div>
                  <div>No projects match your filters</div>
                  <button className="btn btn-ghost btn-sm" onClick={() => { setSearchQ(''); setSelectedSkills([]); setTypeFilter('all'); setSelectedTag(''); }}>
                    Clear all filters
                  </button>
                </div>
              ) : (
                <div className="projects-grid">
                  {filteredProjects.map((p) => (
                    <ProjectCard
                      key={p.id}
                      project={p}
                      currentUserId={currentUser.id}
                      onApply={applyToProject}
                      onViewDetail={viewOwnProject}
                      requestStatus={projectStatusMap[p.id] || ''}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {view === 'people' && (
            <>
              <div className="results-info muted">
                Showing <strong style={{ color: 'var(--white)' }}>{filteredUsers.length}</strong> students
              </div>
              {filteredUsers.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon"><Users size={40} /></div>
                  <div>No people available yet.</div>
                </div>
              ) : (
                <div className="people-grid">
                  {filteredUsers.map(user => (
                    <PersonCard
                      key={user.id}
                      user={user}
                      setPage={setPage}
                      onConnect={sendConnectionRequest}
                      isRequesting={requestingUserId === user.id}
                      isConnected={(connectionSummary.connectedUserIds || []).includes(user.id)}
                      isRequested={(connectionSummary.outgoingToUserIds || []).includes(user.id)}
                      hasIncoming={(connectionSummary.incomingFromUserIds || []).includes(user.id)}
                      onSendHi={() => openChatWithUser({ userId: user.id, setPage, autoMessage: 'Hi 👋' })}
                      onViewProfile={() => { setViewingUserId(user.id); setPage('profile'); }}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <AnimatePresence>
      {selectedProfile && (
        <motion.div className="person-modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} onClick={() => setSelectedProfile(null)}>
          <motion.div
            className="person-modal card"
            initial={{ opacity: 0, scale: 0.95, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: 'spring', bounce: 0.18, visualDuration: 0.35 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="person-modal-header">
              <div className="avatar avatar-lg" style={{ background: 'var(--teal)', color: '#0a0f1c', fontWeight: 800, fontSize: 22 }}>
                {selectedProfile.initials}
              </div>
              <div>
                <div className="person-name">{selectedProfile.name}</div>
                <div className="person-meta muted">{selectedProfile.usn} {selectedProfile.dept ? `· ${selectedProfile.dept}` : ''} {selectedProfile.year ? `· ${selectedProfile.year}` : ''}</div>
              </div>
            </div>
            <p className="muted" style={{ fontSize: 13 }}>{selectedProfile.bio || 'No bio added yet.'}</p>
            <div className="person-skills" style={{ marginTop: 8 }}>
              {(selectedProfile.skills || []).length === 0 ? (
                <span className="muted" style={{ fontSize: 12 }}>No skills listed.</span>
              ) : (
                (selectedProfile.skills || []).map((skill) => <span key={skill} className="skill-tag">{skill}</span>)
              )}
            </div>
            <div className="person-modal-actions">
              <button className="btn btn-outline btn-sm" onClick={() => openChatWithUser({ userId: selectedProfile.id, setPage })}>Message</button>
              <button className="btn btn-lime btn-sm" onClick={() => openChatWithUser({ userId: selectedProfile.id, setPage, autoMessage: 'Hi 👋' })}>Send Hi</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelectedProfile(null)}>Close</button>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

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

function PersonCard({ user, onConnect, isConnected, isRequested, hasIncoming, isRequesting, setPage, onSendHi, onViewProfile }) {
  const buttonText = isConnected
    ? 'Connected'
    : hasIncoming
      ? 'Accept in Requests'
      : isRequested
        ? 'Requested'
        : isRequesting
          ? 'Requesting...'
          : 'Connect';

  const disabled = isConnected || isRequested || isRequesting;

  return (
    <div className="person-card card card-lime-border">
      <div className="person-header">
        <div className="avatar avatar-lg" style={{ background: 'var(--teal)', color: '#0a0f1c', fontWeight: 800, fontSize: 22 }}>
          {user.initials}
        </div>
        <div className="match-badge">{Number.isFinite(Number(user.matchScore)) ? `${Math.round(Number(user.matchScore))}% match` : '-- match'}</div>
      </div>
      <div className="person-name">{user.name}</div>
      <div className="person-meta muted">{user.usn} · {user.dept} · {user.year}</div>
      <p className="person-bio muted" style={{ fontSize: 12, marginTop: 8 }}>{user.bio}</p>
      <div className="person-skills">
        {user.skills.slice(0, 4).map(s => <span key={s} className="skill-tag">{s}</span>)}
        {user.skills.length > 4 && <span className="skill-tag">+{user.skills.length - 4}</span>}
      </div>
      <div className="person-stats">
        <span className="muted" style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}><Briefcase size={12} /> {user.projectsPosted} projects</span>
        <span className="muted" style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}><Users size={12} /> {user.collaborations} collabs</span>
      </div>
      <button
        className="btn btn-lime btn-sm full-w"
        onClick={() => {
          if (hasIncoming) {
            setPage('requests');
            return;
          }
          onConnect?.(user.id);
        }}
        disabled={disabled}
      >
        {buttonText}
      </button>
      {isConnected && (
        <div className="person-connected-actions">
          <button className="btn btn-outline btn-sm" onClick={onSendHi}>Send Hi</button>
          <button className="btn btn-outline btn-sm" onClick={onViewProfile}>View Profile</button>
        </div>
      )}
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
