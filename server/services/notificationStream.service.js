const clientsByUserId = new Map();

export const addNotificationStreamClient = (userId, res) => {
  const key = String(userId);
  const set = clientsByUserId.get(key) || new Set();
  set.add(res);
  clientsByUserId.set(key, set);
};

export const removeNotificationStreamClient = (userId, res) => {
  const key = String(userId);
  const set = clientsByUserId.get(key);

  if (!set) return;

  set.delete(res);
  if (set.size === 0) {
    clientsByUserId.delete(key);
  }
};

export const publishNotificationEventToUser = (userId, payload) => {
  const key = String(userId);
  const set = clientsByUserId.get(key);
  if (!set || set.size === 0) return;

  const body = `event: notification\ndata: ${JSON.stringify(payload)}\n\n`;

  for (const res of set) {
    try {
      res.write(body);
    } catch {
      // Ignore broken SSE connections; close handler will clean map.
    }
  }
};
