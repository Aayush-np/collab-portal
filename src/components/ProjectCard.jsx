import { Heart, MessageCircle, Users, Calendar, Briefcase, ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { timeAgo } from '../utils/time';
import './ProjectCard.css';

export default function ProjectCard({ project, currentUserId, onViewDetail, onApply, requestStatus = '' }) {
  const [liked, setLiked] = useState(false);
  const [likes, setLikes] = useState(Number(project.likes || 0));

  const teamSize = Number(project.teamSize || 1);
  const currentMembers = Number(project.currentMembers || 1);
  const spotsLeft = teamSize - currentMembers;
  const isInternship = project.type === 'internship';
  const isOwner = Boolean(currentUserId) && (project.author?.id === currentUserId || project.authorId === currentUserId);
  const isRequested = requestStatus === 'pending';
  const isJoined = requestStatus === 'accepted';
  // Live relative time from the actual timestamp (never goes stale).
  const postedLabel = timeAgo(project.createdAt) || project.posted || '';

  const handleLike = (e) => {
    e.stopPropagation();
    setLiked(!liked);
    setLikes(liked ? likes - 1 : likes + 1);
  };

  return (
    <div className={`project-card card ${isInternship ? 'internship-card' : ''}`}>
      {/* Header */}
      <div className="project-card-header">
        <div className="project-author">
          <div className="avatar avatar-sm" style={{ background: getAvatarColor(project.author?.name || 'User'), color: '#0d2137', fontWeight: 800, fontSize: 11 }}>
            {project.author?.initials || 'U'}
          </div>
          <div>
            <div className="author-name">{project.author?.name || 'User'}</div>
            <div className="author-meta muted">{project.author?.usn || ''} {project.author?.usn ? '·' : ''} {postedLabel}</div>
          </div>
        </div>
        <div className="project-badges">
          <span className={`badge ${isInternship ? 'badge-amber' : (project.status === 'Recruiting' ? 'badge-lime' : 'badge-white')}`}>
            {project.status}
          </span>
          {isInternship && <span className="badge badge-amber"><Briefcase size={10} />Internship</span>}
        </div>
      </div>

      {/* Title */}
      <h3 className="project-title">{project.title}</h3>
      <p className="project-desc muted">{String(project.description || '').slice(0, 100)}...</p>

      {/* Skills */}
      <div className="project-skills">
        {(project.skills || []).slice(0, 4).map(s => (
          <span key={s} className="skill-tag">{s}</span>
        ))}
        {(project.skills || []).length > 4 && <span className="skill-tag">+{project.skills.length - 4}</span>}
      </div>

      {/* Tags */}
      <div className="project-tags">
        {(project.tags || []).map(t => (
          <span key={t} className="badge badge-teal">{t}</span>
        ))}
      </div>

      <div className="divider" style={{ margin: '12px 0' }} />

      {/* Footer */}
      <div className="project-card-footer">
        <div className="project-meta">
          <span className="meta-item">
            <Users size={13} />
            {currentMembers}/{teamSize}
            {spotsLeft > 0 && <span className="spots-left">{spotsLeft} spot{spotsLeft > 1 ? 's' : ''} left</span>}
          </span>
          {project.deadline && (
            <span className="meta-item">
              <Calendar size={13} />
              {project.deadline}
            </span>
          )}
        </div>

        <div className="project-actions">
          <button className={`action-btn ${liked ? 'liked' : ''}`} onClick={handleLike}>
            <Heart size={14} fill={liked ? 'currentColor' : 'none'} />
            {likes}
          </button>
          <button className="action-btn">
            <MessageCircle size={14} />
            {Number(project.comments || 0)}
          </button>
          <button
            className="btn btn-outline btn-sm"
            onClick={() => onViewDetail?.(project)}
            style={{ marginRight: 'auto' }}
          >
            View <ArrowRight size={13} />
          </button>
          <button
            className="btn btn-lime btn-sm apply-btn"
            onClick={() => {
              if (isOwner) {
                onViewDetail?.(project);
                return;
              }
              if (!isRequested && !isJoined) {
                onApply?.(project);
              }
            }}
            disabled={isRequested || isJoined}
          >
            {isOwner ? 'Edit' : isJoined ? 'Joined' : isRequested ? 'Requested' : 'Apply'} <ArrowRight size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

function getAvatarColor(name) {
  const colors = ['#fbbf24', '#38bdf8', '#34d399', '#f472b6', '#a3e635', '#fb923c'];
  let hash = 0;
  for (let c of name) hash = c.charCodeAt(0) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}
