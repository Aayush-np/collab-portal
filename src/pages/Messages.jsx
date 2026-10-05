import { useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { Search, ArrowLeft, Plus, ArrowRight, Star, Trash2, Inbox, MessageSquare, Check, CheckCheck, Pencil } from 'lucide-react';
import { apiDelete, apiGet, apiPost, apiPut } from '../services/api';
import { toast } from '../utils/toast';
import './Messages.css';

const apiBase = import.meta.env.VITE_API_BASE_URL || '/api';
const socketUrl = import.meta.env.VITE_SOCKET_URL || (apiBase.startsWith('http') ? apiBase.replace(/\/api\/?$/, '') : 'http://localhost:4000');

const formatTime = (iso) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};

export default function Messages({ currentUser, accessToken, withAccessRetry, onUnreadChange, setPage, setViewingUserId }) {
  const [convos, setConvos] = useState([]);
  const [activeId, setActiveId] = useState('');
  const [input, setInput] = useState('');
  const [mobileView, setMobileView] = useState('list');
  const [searchQ, setSearchQ] = useState('');
  const [userSearchQ, setUserSearchQ] = useState('');
  const [userResults, setUserResults] = useState([]);
  const [isSending, setIsSending] = useState(false);
  const [busyConversationId, setBusyConversationId] = useState('');
  const [busyMessageId, setBusyMessageId] = useState('');
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [listMode, setListMode] = useState('all');
  const [isRenaming, setIsRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const renameActiveRef = useRef(false);
  const socketRef = useRef(null);
  const typingSentRef = useRef(false);
  const typingTimeoutRef = useRef(null);
  const activeIdRef = useRef('');
  const currentUserIdRef = useRef(currentUser?.id);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    activeIdRef.current = activeId;
    setPartnerTyping(false);
  }, [activeId]);

  useEffect(() => {
    currentUserIdRef.current = currentUser?.id;
  }, [currentUser?.id]);

  const active = convos.find((c) => c.id === activeId) || null;

  // Fast sender lookup for group chats (per-message initials).
  const memberById = useMemo(
    () => new Map((active?.members || []).map((m) => [m.id, m])),
    [active?.members]
  );

  // Keep the newest message in view when messages arrive or the chat changes.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [activeId, active?.messages?.length]);

  const refreshConversations = async (preserveActive = true) => {
    const result = await withAccessRetry((token) => apiGet('/messages/conversations', token));
    setConvos(result.conversations || []);
    onUnreadChange?.(result.unreadTotal || 0);

    if (preserveActive && activeId && result.conversations.some((c) => c.id === activeId)) {
      return;
    }
    if (!activeId && result.conversations.length > 0) {
      setActiveId(result.conversations[0].id);
    }
  };

  useEffect(() => {
    refreshConversations(false).catch(() => {});
  }, []);

  useEffect(() => {
    if (!accessToken) return;

    const socket = io(socketUrl, {
      auth: { token: accessToken },
    });
    socketRef.current = socket;

    socket.on('message:new', (data) => {
      if (!data?.conversationId || !data?.message) return;

      setConvos((prev) => prev.map((conversation) => {
        if (conversation.id !== data.conversationId) return conversation;

        const exists = (conversation.messages || []).some((msg) => msg.id === data.message.id);
        if (exists) return conversation;

        return {
          ...conversation,
          messages: [...(conversation.messages || []), data.message],
          lastMessage: data.message.text,
          updatedAt: data.updatedAt || data.message.createdAt,
          unread: conversation.id === activeIdRef.current ? 0 : conversation.unread,
        };
      }));

      if (data.conversationId !== activeIdRef.current) {
        refreshConversations(true).catch(() => {});
      }
    });

    socket.on('conversation:read', (data) => {
      if (!data?.conversationId) return;
      setConvos((prev) => prev.map((conversation) => {
        if (conversation.id !== data.conversationId) return conversation;
        return {
          ...conversation,
          unread: data.userId === currentUserIdRef.current ? 0 : conversation.unread,
        };
      }));
      refreshConversations(true).catch(() => {});
    });

    socket.on('conversation:typing', (data) => {
      if (data?.conversationId !== activeIdRef.current) return;
      if (data?.userId === currentUserIdRef.current) return;
      setPartnerTyping(Boolean(data?.isTyping));
    });

    socket.on('conversation:updated', () => {
      refreshConversations(true).catch(() => {});
    });

    socket.on('conversation:deleted', (data) => {
      if (!data?.conversationId) return;
      setConvos((prev) => prev.filter((c) => c.id !== data.conversationId));
      if (activeId === data.conversationId) {
        setActiveId('');
        setMobileView('list');
      }
      refreshConversations(false).catch(() => {});
    });

    return () => {
      socketRef.current = null;
      socket.disconnect();
    };
  }, [accessToken]);

  useEffect(() => {
    if (!activeId) return;

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }

    const shouldSignalTyping = Boolean(input.trim());
    if (shouldSignalTyping && !typingSentRef.current) {
      socketRef.current?.emit('typing', { conversationId: activeId, isTyping: true });
      typingSentRef.current = true;
    }

    if (!shouldSignalTyping && typingSentRef.current) {
      socketRef.current?.emit('typing', { conversationId: activeId, isTyping: false });
      typingSentRef.current = false;
    }

    if (shouldSignalTyping) {
      typingTimeoutRef.current = setTimeout(() => {
        socketRef.current?.emit('typing', { conversationId: activeId, isTyping: false });
        typingSentRef.current = false;
      }, 1500);
    }

    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
    };
  }, [input, activeId]);

  useEffect(() => {
    if (!active || !active.unread) return;
    withAccessRetry((token) => apiPost(`/messages/${active.id}/read`, {}, token))
      .then(() => refreshConversations(true))
      .catch(() => {});
  }, [activeId]);

  useEffect(() => {
    const openFromDetail = async (detail) => {
      const userId = detail?.userId;
      if (!userId) return;
      const created = await withAccessRetry((token) => apiPost('/messages/conversations', { otherUserId: userId }, token));
      await refreshConversations(false);

      const nextConvoId = created?.conversation?.id || '';

      if (detail?.autoMessage && nextConvoId) {
        await withAccessRetry((token) => apiPost('/messages/send', { conversationId: nextConvoId, text: detail.autoMessage }, token));
      }

      if (created?.conversation?.id) {
        setActiveId(created.conversation.id);
        setMobileView('chat');
      } else if (nextConvoId) {
        setActiveId(nextConvoId);
        setMobileView('chat');
      }
      await refreshConversations(true);
    };

    const handler = async (event) => {
      await openFromDetail(event.detail || {});
    };

    window.addEventListener('open-chat-with-user', handler);

    const pending = window.__pendingChatOpen;
    if (pending?.userId) {
      window.__pendingChatOpen = null;
      openFromDetail(pending).catch(() => {});
    }

    return () => window.removeEventListener('open-chat-with-user', handler);
  }, []);

  const filteredConvos = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    const base = !q
      ? convos
      : convos.filter((c) => (c.partner?.name || '').toLowerCase().includes(q) || (c.partner?.email || '').toLowerCase().includes(q));

    const modeFiltered = listMode === 'favorites'
      ? base.filter((conversation) => conversation.favorite)
      : base;

    return [...modeFiltered].sort((a, b) => {
      const fav = Number(Boolean(b.favorite)) - Number(Boolean(a.favorite));
      if (fav !== 0) return fav;
      return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
    });
  }, [convos, searchQ, listMode]);

  const searchUsers = async (q) => {
    setUserSearchQ(q);
    if (!q.trim()) {
      setUserResults([]);
      return;
    }
    const result = await withAccessRetry((token) => apiGet(`/messages/users?q=${encodeURIComponent(q)}`, token));
    setUserResults(result.users || []);
  };

  const startConversation = async (userId) => {
    const created = await withAccessRetry((token) => apiPost('/messages/conversations', { otherUserId: userId }, token));
    await refreshConversations(false);
    setUserSearchQ('');
    setUserResults([]);
    if (created?.conversation?.id) {
      setActiveId(created.conversation.id);
      setMobileView('chat');
    }
  };

  const sendMsg = async () => {
    if (!input.trim() || !active || isSending) return;
    const text = input.trim();
    setInput('');
    setIsSending(true);
    socketRef.current?.emit('typing', { conversationId: active.id, isTyping: false });
    typingSentRef.current = false;
    setPartnerTyping(false);

    try {
      const result = await withAccessRetry((token) => apiPost('/messages/send', { conversationId: active.id, text }, token));
      if (result?.conversation) {
        setConvos((prev) => prev.map((conversation) => (conversation.id === result.conversation.id ? result.conversation : conversation)));
      }
      if (result?.message && !result?.conversation) {
        setConvos((prev) => prev.map((conversation) => {
          if (conversation.id !== active.id) return conversation;
          return {
            ...conversation,
            messages: [...(conversation.messages || []), result.message],
            lastMessage: result.message.text,
            updatedAt: result.message.createdAt,
          };
        }));
      }
    } finally {
      setIsSending(false);
      await refreshConversations(true).catch(() => {});
    }
  };

  const toggleFavorite = async () => {
    if (!active) return;
    setBusyConversationId(active.id);
    try {
      const result = await withAccessRetry((token) => apiPost(`/messages/${active.id}/favorite`, {}, token));
      if (result?.conversation) {
        setConvos((prev) => prev.map((c) => (c.id === result.conversation.id ? result.conversation : c)));
      }
      await refreshConversations(true);
    } finally {
      setBusyConversationId('');
    }
  };

  const clearChat = async () => {
    if (!active) return;
    setBusyConversationId(active.id);
    try {
      const result = await withAccessRetry((token) => apiDelete(`/messages/${active.id}`, token));
      if (result?.deletedConversationId) {
        setConvos((prev) => prev.filter((c) => c.id !== result.deletedConversationId));
        setActiveId('');
        setMobileView('list');
      }
      await refreshConversations(false);
    } finally {
      setBusyConversationId('');
    }
  };

  const deleteMessage = async (messageId) => {
    if (!active?.id || !messageId) return;
    setBusyMessageId(messageId);
    try {
      const result = await withAccessRetry((token) => apiDelete(`/messages/${active.id}/messages/${messageId}`, token));
      if (result?.conversation) {
        setConvos((prev) => prev.map((c) => (c.id === result.conversation.id ? result.conversation : c)));
      }
      await refreshConversations(true);
    } finally {
      setBusyMessageId('');
    }
  };

  const openUserProfile = (userId) => {
    if (!userId) return;
    setViewingUserId?.(userId);
    setPage?.('profile');
  };

  const startRename = () => {
    if (!active?.isGroup) return;
    renameActiveRef.current = true;
    setNameDraft(active?.name || '');
    setIsRenaming(true);
  };

  const cancelRename = () => {
    renameActiveRef.current = false;
    setIsRenaming(false);
  };

  const saveRename = async () => {
    // Guard: a blur after Escape must not save.
    if (!renameActiveRef.current) return;
    renameActiveRef.current = false;
    const name = nameDraft.trim();
    setIsRenaming(false);
    if (!name || !active) return;
    try {
      const result = await withAccessRetry((token) => apiPut(`/messages/${active.id}/name`, { name }, token));
      if (result?.conversation) {
        setConvos((prev) => prev.map((c) => (c.id === result.conversation.id ? result.conversation : c)));
      }
      toast('Group name updated.', 'success');
    } catch (e) {
      toast(e.message || 'Could not rename group.', 'error');
    }
  };

  return (
    <div className="messages-page">
      <aside className={`convo-list ${mobileView === 'chat' ? 'mobile-hide' : ''}`}>
        <div className="convo-list-header">
          <h2>Messages</h2>
          <div className="convo-view-toggle">
            <button className={`view-tab ${listMode === 'all' ? 'active' : ''}`} onClick={() => setListMode('all')}>All</button>
            <button className={`view-tab ${listMode === 'favorites' ? 'active' : ''}`} onClick={() => setListMode('favorites')}>Favourites</button>
          </div>
          <div className="convo-search">
            <Search size={13} />
            <input placeholder="Search conversations..." value={searchQ} onChange={(e) => setSearchQ(e.target.value)} />
          </div>
          <div className="convo-search">
            <Plus size={13} />
            <input placeholder="Start chat by name/email" value={userSearchQ} onChange={(e) => searchUsers(e.target.value)} />
          </div>
          {userResults.length > 0 && (
            <div className="convo-user-results">
              {userResults.map((u) => (
                <button key={u.id} className="convo-user-item" onClick={() => startConversation(u.id)}>
                  <div className="avatar avatar-sm" style={{ background: 'var(--teal)', color: '#0a0f1c', fontWeight: 700, fontSize: 11 }}>
                    {u.initials}
                  </div>
                  <div className="convo-info">
                    <div className="convo-name">{u.name}</div>
                    <div className="convo-last muted">{u.email}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="convo-items">
          {filteredConvos.length === 0 ? (
            <div className="chat-empty" style={{ padding: 20 }}>
              <Inbox size={34} />
              <div>{listMode === 'favorites' ? 'No favourite conversations yet' : 'No conversations yet'}</div>
            </div>
          ) : (
            filteredConvos.map((c) => (
              <div
                key={c.id}
                className={`convo-item ${active?.id === c.id ? 'active' : ''}`}
                onClick={() => { setActiveId(c.id); setMobileView('chat'); }}
              >
                <div
                  className="avatar avatar-md"
                  style={{ background: 'var(--teal)', color: '#0a0f1c', fontWeight: 700, fontSize: 15, cursor: c.isGroup ? 'default' : 'pointer' }}
                  title={c.isGroup ? (c.name || 'Team chat') : `View ${c.partner?.name || 'user'}'s profile`}
                  onClick={(e) => {
                    if (c.isGroup) return;
                    e.stopPropagation();
                    openUserProfile(c.partner?.id);
                  }}
                >
                  {c.partner?.initials || 'U'}
                </div>
                <div className="convo-info">
                  <div className="convo-name">
                    {c.partner?.name || 'User'}
                    {c.isGroup && <span className="badge badge-teal convo-team-badge">Team</span>}
                  </div>
                  <div className="convo-last muted">{(c.lastMessage || '').slice(0, 38)}{(c.lastMessage || '').length > 38 ? '...' : ''}</div>
                </div>
                <div className="convo-meta">
                  <div className="convo-time muted">{formatTime(c.updatedAt)}</div>
                  {c.favorite && <Star size={12} className="convo-fav-star" fill="currentColor" />}
                  {c.unread > 0 && <span className="unread-badge">{c.unread}</span>}
                </div>
              </div>
            ))
          )}
        </div>
      </aside>

      <div className={`chat-window ${mobileView === 'list' ? 'mobile-hide' : ''}`}>
        {active ? (
          <>
            <div className="chat-header">
              <button className="btn btn-ghost mobile-back" onClick={() => setMobileView('list')}>
                <ArrowLeft size={16} />
              </button>
              <button
                type="button"
                className={`chat-user-trigger ${active.isGroup ? 'is-group' : ''}`}
                onClick={active.isGroup ? undefined : () => openUserProfile(active.partner?.id)}
                title={active.isGroup ? (active.name || 'Team chat') : `View ${active.partner?.name || 'user'}'s profile`}
              >
                <div className="avatar avatar-sm" style={{ background: 'var(--teal)', color: '#0a0f1c', fontWeight: 700, fontSize: 11 }}>
                  {active.partner?.initials || 'U'}
                </div>
                <div className="chat-user-info">
                  {isRenaming ? (
                    <input
                      className="chat-rename-input"
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); saveRename(); }
                        if (e.key === 'Escape') { e.preventDefault(); cancelRename(); }
                      }}
                      onBlur={saveRename}
                      autoFocus
                      maxLength={80}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <div className="chat-name">
                      {active.partner?.name || 'User'}
                      {active.isGroup && <span className="badge badge-teal convo-team-badge">Team</span>}
                    </div>
                  )}
                  <div className="chat-status">
                    <span className="notif-dot" />
                    {partnerTyping ? 'Typing...' : (active.isGroup ? `${active.participants?.length || 0} members` : 'Live chat')}
                  </div>
                </div>
              </button>
              <div className="chat-header-actions">
                {active.isGroup && active.ownerId === currentUser.id && !isRenaming && (
                  <button className="btn btn-outline btn-sm" onClick={startRename} title="Rename group">
                    <Pencil size={13} />
                  </button>
                )}
                <button className="btn btn-outline btn-sm" onClick={toggleFavorite} disabled={busyConversationId === active.id}>
                  <Star size={13} fill={active.favorite ? 'currentColor' : 'none'} />
                  {active.favorite ? 'Favorited' : 'Favorite'}
                </button>
                {(!active.isGroup || active.ownerId === currentUser.id) && (
                  <button className="btn btn-outline btn-sm" onClick={clearChat} disabled={busyConversationId === active.id}>
                    <Trash2 size={13} /> Delete chat
                  </button>
                )}
              </div>
            </div>

            <div className="chat-messages">
              {(active.messages || []).length === 0 && (
                <div className="chat-empty-inline">
                  <MessageSquare size={22} />
                  <div>No messages yet — say hi to {active.partner?.name || 'them'} 👋</div>
                </div>
              )}
              {(active.messages || []).map((msg, index, messages) => {
                const isMe = msg.from === currentUser.id;
                const sender = memberById.get(msg.from);
                // Read receipt: only on the sender's LAST message (WhatsApp-style).
                const nextMsg = messages[index + 1];
                const isLastOwn = isMe && (!nextMsg || nextMsg.from !== currentUser.id);
                // DM: partner has unread. Group: any other member has unread.
                const hasUnread = active.isGroup
                  ? Object.entries(active.unreadBy || {}).some(([uid, n]) => uid !== currentUser.id && Number(n) > 0)
                  : Number(active.unreadBy?.[active.partner?.id] || 0) > 0;

                return (
                  <div key={msg.id} className={`message-row ${isMe ? 'me' : 'them'}`}>
                    {!isMe && (
                      <div
                        className="avatar avatar-sm"
                        style={{ background: 'var(--teal)', color: '#0a0f1c', fontWeight: 700, fontSize: 11, cursor: active.isGroup ? 'pointer' : 'default' }}
                        title={active.isGroup ? `View ${sender?.name || 'user'}'s profile` : undefined}
                        onClick={active.isGroup ? () => openUserProfile(sender?.id) : undefined}
                      >
                        {sender?.initials || active.partner?.initials || 'U'}
                      </div>
                    )}
                    <div className="message-bubble">
                      <div className="message-text">{msg.text}</div>
                      <div className="message-time muted">
                        {formatTime(msg.createdAt)}
                        {isLastOwn && (
                          hasUnread
                            ? <Check size={13} className="msg-tick" />
                            : <CheckCheck size={13} className="msg-tick read" />
                        )}
                      </div>
                    </div>
                    {isMe && (
                      <button
                        className="message-delete-btn"
                        onClick={() => deleteMessage(msg.id)}
                        disabled={busyMessageId === msg.id}
                        title="Delete message"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <div className="chat-input-row">
              <input
                placeholder={active.isGroup ? `Message the team...` : `Message ${active.partner?.name || 'user'}...`}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } }}
              />
              <button className="btn btn-lime send-btn" onClick={sendMsg} disabled={!input.trim() || isSending} title={isSending ? 'Sending...' : 'Send message'}>
                <ArrowRight size={16} />
              </button>
            </div>
          </>
        ) : (
          <div className="chat-empty">
            <MessageSquare size={40} />
            <div>Select a conversation to start chatting</div>
          </div>
        )}
      </div>
    </div>
  );
}
