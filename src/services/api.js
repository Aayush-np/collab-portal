const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

const parseJson = async (response) => {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || 'Request failed.');
  }
  return data;
};

const request = async (path, { method = 'GET', body, token } = {}) => {
  let res;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body || {}) } : {}),
    });
  } catch {
    // Only a network/CORS failure lands here — server errors are surfaced below.
    throw new Error('Could not reach server. Start backend API and try again.');
  }
  return parseJson(res);
};

export const apiPost = (path, body, token) => request(path, { method: 'POST', body, token });
export const apiGet = (path, token) => request(path, { method: 'GET', token });
export const apiPut = (path, body, token) => request(path, { method: 'PUT', body, token });
export const apiDelete = (path, token) => request(path, { method: 'DELETE', token });
