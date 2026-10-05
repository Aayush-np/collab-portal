let ioInstance = null;

export const setSocketIo = (io) => {
  ioInstance = io;
};

export const getSocketIo = () => ioInstance;

export const emitToUsers = (userIds, event, payload) => {
  if (!ioInstance) return;
  userIds.forEach((id) => {
    ioInstance.to(`user:${id}`).emit(event, payload);
  });
};

// Broadcast to every connected client (e.g. ideas feed updates).
export const emitToAll = (event, payload) => {
  if (!ioInstance) return;
  ioInstance.emit(event, payload);
};
