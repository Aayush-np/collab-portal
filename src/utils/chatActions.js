export const openChatWithUser = ({ userId, setPage, autoMessage = '' } = {}) => {
  if (!userId) return;

  const detail = {
    userId,
    ...(autoMessage ? { autoMessage } : {}),
  };

  window.__pendingChatOpen = detail;
  window.dispatchEvent(new CustomEvent('open-chat-with-user', { detail }));

  if (typeof setPage === 'function') {
    setPage('messages');
  }
};
