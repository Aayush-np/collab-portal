const toInitials = (name) => {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'CH';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
};

export const createDefaultProfile = ({ userId, name, email }) => ({
  id: userId,
  name,
  username: String(name || '').toLowerCase().replace(/\s+/g, '_') || `user_${userId.slice(0, 6)}`,
  usn: '',
  email,
  dept: 'Computer Science & Engineering',
  year: '2nd Year',
  avatar: null,
  banner: null,
  initials: toInitials(name),
  bio: 'Tell collaborators what you are building and what kind of teammates you are looking for.',
  skills: [],
  skillLevels: {},
  interests: [],
  github: '',
  linkedin: '',
  projectsPosted: 0,
  collaborations: 0,
  matchScore: null,
});

export const normalizeLegacyProfileDefaults = (profile) => {
  if (!profile) return profile;
  const skills = Array.isArray(profile.skills) ? profile.skills : [];
  const interests = Array.isArray(profile.interests) ? profile.interests : [];

  const isLegacyDefaultSkills = skills.length === 3
    && skills.includes('React.js')
    && skills.includes('Node.js')
    && skills.includes('Git');

  const isLegacyDefaultInterests = interests.length === 2
    && interests.includes('Web Development')
    && interests.includes('Open Source');

  if (!isLegacyDefaultSkills && !isLegacyDefaultInterests) {
    return {
      ...profile,
      skills,
      interests,
      skillLevels: profile.skillLevels || {},
    };
  }

  return {
    ...profile,
    skills: isLegacyDefaultSkills ? [] : skills,
    interests: isLegacyDefaultInterests ? [] : interests,
    skillLevels: isLegacyDefaultSkills ? {} : (profile.skillLevels || {}),
  };
};
