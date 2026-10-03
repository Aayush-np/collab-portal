import { useEffect, useState } from 'react';
import { Check, X, MessageCircle, Briefcase } from 'lucide-react';
import { apiGet, apiPost } from '../services/api';
import { openChatWithUser } from '../utils/chatActions';
import { toast } from '../utils/toast';
import './Requests.css';

export default function Requests({ accessToken, withAccessRetry, setPage, onCountsChange }) {
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [projectIncoming, setProjectIncoming] = useState([]);
  const [projectOutgoing, setProjectOutgoing] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');

  const load = async () => {
    if (!accessToken) {
      setIncoming([]);
      setOutgoing([]);
      setProjectIncoming([]);
      setProjectOutgoing([]);
      onCountsChange?.(0);
      return;
    }

    setLoading(true);
    try {
      const [incomingResult, outgoingResult, projectIncomingResult, projectOutgoingResult] = await Promise.all([
        withAccessRetry((token) => apiGet('/connections/requests?type=incoming&status=pending', token)),
        withAccessRetry((token) => apiGet('/connections/requests?type=outgoing&status=pending', token)),
        withAccessRetry((token) => apiGet('/ideas/requests?type=incoming&status=pending', token)),
        withAccessRetry((token) => apiGet('/ideas/requests?type=outgoing', token)),
      ]);

      const nextIncoming = incomingResult.requests || [];
      const nextOutgoing = outgoingResult.requests || [];
      const nextProjectIncoming = projectIncomingResult.requests || [];
      const nextProjectOutgoing = projectOutgoingResult.requests || [];
      setIncoming(nextIncoming);
      setOutgoing(nextOutgoing);
      setProjectIncoming(nextProjectIncoming);
      setProjectOutgoing(nextProjectOutgoing);
      onCountsChange?.(nextIncoming.length);
      window.dispatchEvent(new CustomEvent('connections-changed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load().catch(() => {
      setIncoming([]);
      setOutgoing([]);
      onCountsChange?.(0);
      setLoading(false);
    });
  }, [accessToken]);

  const acceptRequest = async (requestId) => {
    if (!requestId) return;
    setBusyId(requestId);
    try {
      await withAccessRetry((token) => apiPost(`/connections/requests/${requestId}/accept`, {}, token));
      toast('Connection accepted.', 'success');
      await load();
      window.dispatchEvent(new CustomEvent('connections-changed'));
    } catch (e) {
      toast(e.message || 'Could not accept request.', 'error');
    } finally {
      setBusyId('');
    }
  };

  const rejectRequest = async (requestId) => {
    if (!requestId) return;
    setBusyId(requestId);
    try {
      await withAccessRetry((token) => apiPost(`/connections/requests/${requestId}/reject`, {}, token));
      toast('Request rejected.', 'info');
      await load();
      window.dispatchEvent(new CustomEvent('connections-changed'));
    } catch (e) {
      toast(e.message || 'Could not reject request.', 'error');
    } finally {
      setBusyId('');
    }
  };

  const openChat = (userId) => {
    if (!userId) return;
    openChatWithUser({ userId, setPage });
  };

  const acceptProjectRequest = async (requestId) => {
    if (!requestId) return;
    setBusyId(requestId);
    try {
      await withAccessRetry((token) => apiPost(`/ideas/requests/${requestId}/accept`, {}, token));
      toast('Project request accepted.', 'success');
      await load();
      window.dispatchEvent(new CustomEvent('project-requests-changed'));
    } catch (e) {
      toast(e.message || 'Could not accept request.', 'error');
    } finally {
      setBusyId('');
    }
  };

  const rejectProjectRequest = async (requestId) => {
    if (!requestId) return;
    setBusyId(requestId);
    try {
      await withAccessRetry((token) => apiPost(`/ideas/requests/${requestId}/reject`, {}, token));
      toast('Project request rejected.', 'info');
      await load();
      window.dispatchEvent(new CustomEvent('project-requests-changed'));
    } catch (e) {
      toast(e.message || 'Could not reject request.', 'error');
    } finally {
      setBusyId('');
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Requests</h1>
        <p>Manage incoming and outgoing connection requests</p>
      </div>

      {loading ? (
        <div className="card requests-empty">Loading requests...</div>
      ) : (
        <div className="requests-grid requests-grid-3">
          <section className="card requests-column">
            <div className="requests-title-row">
              <h3>Incoming Requests</h3>
              <span className="badge badge-lime">{incoming.length}</span>
            </div>
            {incoming.length === 0 ? (
              <div className="requests-empty">No incoming requests.</div>
            ) : (
              <div className="requests-list">
                {incoming.map((request) => (
                  <div className="request-item" key={request.id}>
                    <div className="request-user-row">
                      <div className="avatar avatar-sm request-avatar">{request.counterpart?.initials || 'U'}</div>
                      <div>
                        <div className="request-name">{request.counterpart?.name || 'User'}</div>
                        <div className="request-email muted">{request.counterpart?.email || ''}</div>
                      </div>
                    </div>
                    <div className="request-actions">
                      <button className="btn btn-lime btn-sm" onClick={() => acceptRequest(request.id)} disabled={busyId === request.id}>
                        <Check size={13} /> Accept
                      </button>
                      <button className="btn btn-outline btn-sm" onClick={() => rejectRequest(request.id)} disabled={busyId === request.id}>
                        <X size={13} /> Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="card requests-column">
            <div className="requests-title-row">
              <h3>Outgoing Requests</h3>
              <span className="badge badge-white">{outgoing.length}</span>
            </div>
            {outgoing.length === 0 ? (
              <div className="requests-empty">No outgoing requests.</div>
            ) : (
              <div className="requests-list">
                {outgoing.map((request) => (
                  <div className="request-item" key={request.id}>
                    <div className="request-user-row">
                      <div className="avatar avatar-sm request-avatar">{request.counterpart?.initials || 'U'}</div>
                      <div>
                        <div className="request-name">{request.counterpart?.name || 'User'}</div>
                        <div className="request-email muted">{request.counterpart?.email || ''}</div>
                      </div>
                    </div>
                    <div className="request-actions">
                      <button className="btn btn-outline btn-sm" onClick={() => openChat(request.counterpart?.id)}>
                        <MessageCircle size={13} /> Message
                      </button>
                      <span className="badge badge-amber">Requested</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="card requests-column">
            <div className="requests-title-row">
              <h3>Project Requests</h3>
              <span className="badge badge-amber">{projectIncoming.length}</span>
            </div>
            <div className="requests-subsection">
              <div className="requests-subtitle">Incoming</div>
              {projectIncoming.length === 0 ? (
                <div className="requests-empty">No incoming project requests.</div>
              ) : (
                <div className="requests-list">
                  {projectIncoming.map((request) => (
                    <div className="request-item" key={request.id}>
                      <div className="request-user-row">
                        <div className="avatar avatar-sm request-avatar"><Briefcase size={12} /></div>
                        <div>
                          <div className="request-name">{request.idea?.title || 'Project'}</div>
                          <div className="request-email muted">{request.counterpart?.name || 'User'}</div>
                        </div>
                      </div>
                      <div className="request-actions">
                        <button className="btn btn-lime btn-sm" onClick={() => acceptProjectRequest(request.id)} disabled={busyId === request.id}>
                          <Check size={13} /> Accept
                        </button>
                        <button className="btn btn-outline btn-sm" onClick={() => rejectProjectRequest(request.id)} disabled={busyId === request.id}>
                          <X size={13} /> Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="divider" style={{ margin: '4px 0' }} />

            <div className="requests-subsection">
              <div className="requests-subtitle">Outgoing</div>
              {projectOutgoing.length === 0 ? (
                <div className="requests-empty">No project requests yet.</div>
              ) : (
                <div className="requests-list">
                  {projectOutgoing.map((request) => (
                    <div className="request-item" key={request.id}>
                      <div className="request-user-row">
                        <div className="avatar avatar-sm request-avatar"><Briefcase size={12} /></div>
                        <div>
                          <div className="request-name">{request.idea?.title || 'Project'}</div>
                          <div className="request-email muted">{request.counterpart?.name || 'Owner'}</div>
                        </div>
                      </div>
                      <div className="request-actions">
                        <span className={`badge ${request.status === 'accepted' ? 'badge-lime' : request.status === 'rejected' ? 'badge-red' : 'badge-amber'}`}>
                          {request.status === 'accepted' ? 'Accepted' : request.status === 'rejected' ? 'Rejected' : 'Requested'}
                        </span>
                        {request.status === 'accepted' && (
                          <button className="btn btn-outline btn-sm" onClick={() => openChat(request.counterpart?.id)}>
                            <MessageCircle size={13} /> Message
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

        </div>
      )}
    </div>
  );
}
