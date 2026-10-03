import { useEffect, useState } from 'react';
import { Plus, X, Lightbulb, Briefcase, CheckCircle, ArrowRight, Users, Calendar } from 'lucide-react';
import { apiPost, apiPut } from '../services/api';
import { allSkills, allTags } from '../data/mockData';
import './PostIdea.css';

const INITIAL = {
  title: '',
  type: 'project',
  description: '',
  skills: [],
  tags: [],
  teamSize: 2,
  deadline: '',
  github: '',
  requirements: '',
};

export default function PostIdea({ setPage, currentUser, accessToken, withAccessRetry, editingIdea, onDone }) {
  const [form, setForm] = useState(INITIAL);
  const [skillInput, setSkillInput] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const isEditing = Boolean(editingIdea?.id);

  useEffect(() => {
    if (editingIdea?.id) {
      setForm({
        title: editingIdea.title || '',
        type: editingIdea.type || 'project',
        description: editingIdea.description || '',
        skills: Array.isArray(editingIdea.skills) ? editingIdea.skills : [],
        tags: Array.isArray(editingIdea.tags) ? editingIdea.tags : [],
        teamSize: Number(editingIdea.teamSize || 2),
        deadline: editingIdea.deadline || '',
        github: editingIdea.github || '',
        requirements: editingIdea.requirements || '',
      });
      setSubmitted(false);
      setErrors({});
    }
  }, [editingIdea]);

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const addSkill = (skill) => {
    const trimmed = skill.trim();
    if (trimmed && !form.skills.includes(trimmed)) {
      set('skills', [...form.skills, trimmed]);
    }
    setSkillInput('');
  };

  const removeSkill = (skill) => set('skills', form.skills.filter((item) => item !== skill));
  const toggleTag = (tag) => set('tags', form.tags.includes(tag) ? form.tags.filter((item) => item !== tag) : [...form.tags, tag]);

  const validate = () => {
    const nextErrors = {};
    if (!form.title.trim()) nextErrors.title = 'Title is required';
    if (!form.description.trim() || form.description.length < 50) nextErrors.description = 'Description must be at least 50 characters';
    if (form.skills.length === 0) nextErrors.skills = 'Add at least one required skill';
    return nextErrors;
  };

  const handleSubmit = async () => {
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    if (!currentUser || !accessToken) {
      setErrors({ form: 'Please login again to post an idea.' });
      return;
    }

    setIsLoading(true);
    try {
      if (isEditing) {
        await withAccessRetry((token) => apiPut(`/ideas/${editingIdea.id}`, form, token));
      } else {
        await withAccessRetry((token) => apiPost('/ideas', form, token));
      }
      setSubmitted(true);
    } catch (error) {
      setErrors({ form: error?.message || 'Failed to post idea. Try again.' });
    } finally {
      setIsLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="page-container">
        <div className="success-state">
          <div className="success-icon"><CheckCircle size={48} /></div>
          <h2>{isEditing ? 'Idea Updated Successfully!' : 'Idea Posted Successfully!'}</h2>
          <p className="muted">
            {isEditing
              ? 'Your changes are saved and visible to collaborators.'
              : 'Your project idea is now live. Collaborators can discover and apply to join your team.'}
          </p>
          <div className="success-actions">
            <button className="btn btn-lime btn-lg" onClick={() => { if (isEditing) { onDone?.(); } setPage(isEditing ? 'profile' : 'explore'); }}>
              {isEditing ? 'Back to Profile' : 'Browse Other Projects'}
            </button>
            {!isEditing && (
              <button className="btn btn-outline" onClick={() => { setForm(INITIAL); setSubmitted(false); setErrors({}); }}>
                Post Another Idea
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>{isEditing ? 'Edit Your Idea' : 'Post a New Idea'}</h1>
        <p>{isEditing ? 'Update your project or internship opportunity anytime' : 'Share your project or internship opportunity to find the right collaborators'}</p>
      </div>

      <div className="post-layout">
        <div className="post-form card">
          <div className="form-group">
            <label>Opportunity Type</label>
            <div className="type-selector">
              <button className={`type-btn ${form.type === 'project' ? 'active' : ''}`} onClick={() => set('type', 'project')}>
                <Lightbulb size={18} /> Project Idea
              </button>
              <button className={`type-btn ${form.type === 'internship' ? 'active' : ''}`} onClick={() => set('type', 'internship')}>
                <Briefcase size={18} /> Internship Opp.
              </button>
            </div>
          </div>

          <div className="form-group">
            <label>Project Title *</label>
            <input
              placeholder={form.type === 'project' ? 'e.g. AI-Powered Attendance System' : 'e.g. Looking for teammates for Infosys Internship'}
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
            />
            {errors.title && <span className="error-msg">{errors.title}</span>}
          </div>

          <div className="form-group">
            <label>Description *</label>
            <textarea
              rows={5}
              placeholder="Describe your idea clearly — what problem it solves, who it targets, what you've done so far, and what kind of collaborators you're looking for..."
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              style={{ resize: 'vertical' }}
            />
            <div className="char-count muted">{form.description.length} chars {form.description.length < 50 && '(min 50)'}</div>
            {errors.description && <span className="error-msg">{errors.description}</span>}
          </div>

          <div className="form-group">
            <label>Skills Required *</label>
            <div className="skills-input-row">
              <input
                placeholder="Type a skill and press Enter or click arrow"
                value={skillInput}
                onChange={(e) => setSkillInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSkill(skillInput); } }}
                list="skills-datalist"
              />
              <datalist id="skills-datalist">
                {allSkills.map((skill) => <option key={skill} value={skill} />)}
              </datalist>
              <button className="btn btn-lime btn-sm add-btn" onClick={() => addSkill(skillInput)}>
                <ArrowRight size={16} />
              </button>
            </div>
            {form.skills.length > 0 && (
              <div className="selected-skills">
                {form.skills.map((skill) => (
                  <span key={skill} className="skill-tag active">
                    {skill}
                    <button onClick={() => removeSkill(skill)} className="remove-skill"><X size={11} /></button>
                  </span>
                ))}
              </div>
            )}
            {errors.skills && <span className="error-msg">{errors.skills}</span>}
            <div className="quick-skills">
              <span className="muted" style={{ fontSize: 11 }}>Quick add:</span>
              {allSkills.slice(0, 8).map((skill) => (
                !form.skills.includes(skill) && (
                  <button key={skill} className="skill-tag" onClick={() => addSkill(skill)}>{skill} <Plus size={9} /></button>
                )
              ))}
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Team Size</label>
              <select value={form.teamSize} onChange={(e) => set('teamSize', Number(e.target.value))}>
                {[2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n} members</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Application Deadline</label>
              <input type="date" value={form.deadline} onChange={(e) => set('deadline', e.target.value)} />
            </div>
          </div>

          <div className="form-group">
            <label>Tags</label>
            <div className="tags-grid">
              {allTags.map((tag) => (
                <button
                  key={tag}
                  className={`filter-chip ${form.tags.includes(tag) ? 'active' : ''}`}
                  onClick={() => toggleTag(tag)}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>Additional Requirements <span className="muted">(optional)</span></label>
            <textarea
              rows={3}
              placeholder="Any specific requirements, time commitment, prerequisites..."
              value={form.requirements}
              onChange={(e) => set('requirements', e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>GitHub Repo <span className="muted">(optional)</span></label>
            <input placeholder="https://github.com/yourusername/project" value={form.github} onChange={(e) => set('github', e.target.value)} />
          </div>

          {errors.form && <div className="error-msg" style={{ marginBottom: 12 }}>{errors.form}</div>}

          <div className="post-submit-row">
            <button className="btn btn-outline" onClick={() => { window.dispatchEvent(new CustomEvent('idea-edit-done')); onDone?.(); setPage('dashboard'); }}>Cancel</button>
            <button className="btn btn-lime btn-lg" onClick={handleSubmit} disabled={isLoading}>
              <ArrowRight size={16} /> {isLoading ? (isEditing ? 'Saving...' : 'Publishing...') : (isEditing ? 'Save Changes' : 'Publish Idea')}
            </button>
          </div>
        </div>

        <div className="post-preview">
          <div className="preview-label muted">Live Preview</div>
          <div className="card preview-card">
            <div className="preview-status">
              <span className={`badge ${form.type === 'internship' ? 'badge-amber' : 'badge-lime'}`}>
                {form.type === 'project' ? 'Recruiting' : 'Internship'}
              </span>
            </div>
            <h3 className="preview-title">{form.title || 'Your project title will appear here...'}</h3>
            <p className="muted" style={{ fontSize: 13 }}>
              {form.description ? `${form.description.slice(0, 120)}${form.description.length > 120 ? '...' : ''}` : 'Your description will appear here...'}
            </p>
            {form.skills.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                {form.skills.map((skill) => <span key={skill} className="skill-tag active">{skill}</span>)}
              </div>
            )}
            {form.tags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
                {form.tags.map((tag) => <span key={tag} className="badge badge-teal">{tag}</span>)}
              </div>
            )}
            <div className="preview-meta muted" style={{ marginTop: 10, fontSize: 12, display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
              <Users size={12} /> Team of {form.teamSize}
              {form.deadline && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Calendar size={12} /> Due {form.deadline}</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
