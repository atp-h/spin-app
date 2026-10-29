// Prefer the server's error text over axios' generic "Request failed with status code ..."
export const errorMessage = (error) => error.response?.data?.error || error.message;

// SQLite CURRENT_TIMESTAMP is UTC without a zone marker ("2026-04-11 20:15:00");
// without the "Z" browsers would read it as local time.
export const parseDbDate = (value) => new Date(String(value).replace(' ', 'T') + 'Z');
