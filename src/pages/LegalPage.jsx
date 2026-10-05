import { ArrowLeft } from 'lucide-react';
import logo from '../img/logo.png';
import './LegalPage.css';

const DOCS = {
  privacy: {
    title: 'Privacy Policy',
    updated: 'October 2026',
    intro: 'CollabHub is a collaboration platform built for CMRIT students. This policy explains, in plain language, what data we collect, why we collect it, and the choices you have.',
    sections: [
      {
        h: '1. What we collect',
        p: [
          'Account information: your name, college email address, and a securely hashed password (we never see or store your actual password).',
          'Profile information you choose to add: department, year, USN, skills, interests, bio, and links such as GitHub or LinkedIn.',
          'Content you create: project and internship posts, applications, connection requests, and messages you send to other users.',
          'Technical data: authentication tokens stored in your browser (localStorage) that keep you signed in, and basic server logs (IP address, request timestamps) used to run and secure the service.',
        ],
      },
      {
        h: '2. How we use it',
        p: [
          'To operate your account: signing you in, keeping your session, verifying your email address, and letting you reset your password.',
          'To provide the features: showing your profile to other students, matching and search, messaging, and notifications about activity that involves you (new messages, connection requests, applications to your posts).',
          'To send transactional emails only — email verification and password reset. These are delivered through our email provider (Brevo). We do not send marketing emails.',
        ],
      },
      {
        h: '3. What we do NOT do',
        p: [
          'We do not sell, rent, or trade your personal data.',
          'We do not run third-party analytics, tracking pixels, or advertising scripts on this site.',
          'We do not share your data with anyone except the providers strictly required to run the service (our database host and email provider), and only as needed to deliver the product.',
        ],
      },
      {
        h: '4. Messages and content',
        p: [
          'Messages you send are stored in our database so that you and the recipient can see your conversation.',
          'Be mindful of what you share: your profile and posts are visible to other signed-in CMRIT students.',
          'Administrators may review reported content when investigating abuse.',
        ],
      },
      {
        h: '5. Storage and security',
        p: [
          'Data is stored in a managed cloud database (MongoDB Atlas). Passwords are hashed with bcrypt and are never stored or transmitted in plain text.',
          'Access to the administrative side of the platform is role-restricted and logged.',
        ],
      },
      {
        h: '6. Retention and deletion',
        p: [
          'We keep your data while your account is active. You can edit or remove profile details at any time from your profile page.',
          'You may request deletion of your account and personal data by contacting an administrator — your account, profile, posts, and messages will be removed.',
        ],
      },
      {
        h: '7. Your rights',
        p: [
          'You can access your data, correct it, export your profile details, or ask for its deletion. Because this is a small college platform, the fastest way is to simply contact the administrator, and we will take care of it.',
        ],
      },
      {
        h: '8. Eligibility',
        p: [
          'CollabHub is intended for students of CMRIT with a @cmrit.ac.in email address. Do not use the platform if you do not meet this requirement.',
        ],
      },
      {
        h: '9. Changes to this policy',
        p: [
          'If this policy changes, we will update the "Last updated" date above and announce significant changes on the platform.',
        ],
      },
      {
        h: '10. Contact',
        p: [
          'Questions about privacy? Reach out via the contact information listed in the Terms & Conditions.',
        ],
      },
    ],
  },
  terms: {
    title: 'Terms & Conditions',
    updated: 'October 2026',
    intro: 'These terms govern your use of CollabHub. By creating an account, you agree to them. They are written to be short, readable, and fair.',
    sections: [
      {
        h: '1. Eligibility',
        p: [
          'CollabHub is for students of CMRIT. You need a valid @cmrit.ac.in email address, and each person may hold one account.',
        ],
      },
      {
        h: '2. Your account',
        p: [
          'You are responsible for the activity on your account. Keep your password private.',
          'Provide accurate information when registering and in your profile.',
        ],
      },
      {
        h: '3. Acceptable use',
        p: [
          'Be respectful. Harassment, hate speech, personal attacks, and spam are not tolerated.',
          'Do not post illegal content, plagiarism, malware, or anything you do not have the right to share.',
          'Do not impersonate other people, scrape the platform, or attempt to gain unauthorized access to accounts or systems.',
          'Administrators may remove content and suspend accounts that violate these rules.',
        ],
      },
      {
        h: '4. Your content',
        p: [
          'You keep ownership of everything you post — your ideas, project descriptions, profile text, and messages.',
          'You grant CollabHub a limited, non-exclusive license to host and display your content inside the platform, so the service can function (e.g., showing your post to other students).',
        ],
      },
      {
        h: '5. Conduct between users',
        p: [
          'CollabHub connects students — it is not a party to any agreement you make with other users. Vet your collaborators, agree on expectations, and use good judgement when sharing work or personal information.',
        ],
      },
      {
        h: '6. Availability',
        p: [
          'The platform is provided "as is" and "as available". We aim for reliability but cannot promise uninterrupted service, and features may change or be discontinued.',
        ],
      },
      {
        h: '7. Limitation of liability',
        p: [
          'To the maximum extent permitted by law, CollabHub and its maintainers are not liable for indirect or consequential damages arising from your use of the platform.',
        ],
      },
      {
        h: '8. Termination',
        p: [
          'You can stop using the platform and request account deletion at any time. We may suspend or remove accounts that violate these terms or the law.',
        ],
      },
      {
        h: '9. Changes to these terms',
        p: [
          'We may update these terms as the platform evolves. Continued use after an update means you accept the revised terms.',
        ],
      },
      {
        h: '10. Contact',
        p: [
          'For questions, reports, or account deletion requests, contact: cmritcollabhub@gmail.com',
        ],
      },
    ],
  },
};

export default function LegalPage({ doc = 'privacy' }) {
  const content = DOCS[doc] || DOCS.privacy;

  return (
    <div className="legal-shell">
      <div className="legal-card">
        <div className="legal-top-row">
          <a href="/" className="legal-back">
            <ArrowLeft size={14} /> Back to CollabHub
          </a>
          <span className="legal-updated">Last updated: {content.updated}</span>
        </div>

        <div className="legal-brand">
          <img src={logo} alt="" className="legal-logo" />
          <div>
            <div className="legal-brand-name">CollabHub</div>
            <div className="legal-brand-sub">CMRIT Collaboration Portal</div>
          </div>
        </div>

        <h1>{content.title}</h1>
        <p className="legal-intro">{content.intro}</p>

        {content.sections.map((section) => (
          <section key={section.h} className="legal-section">
            <h2>{section.h}</h2>
            {section.p.map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </section>
        ))}

        <div className="legal-footer">
          {doc === 'privacy' ? (
            <>See also our <a href="/terms">Terms & Conditions</a>.</>
          ) : (
            <>See also our <a href="/privacy">Privacy Policy</a>.</>
          )}
        </div>
      </div>
    </div>
  );
}
