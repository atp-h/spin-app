import axios from 'axios';

let API_BASE_URL = process.env.REACT_APP_API_URL || '';

// Forceer relatieve paden op publieke URL's om 'localhost' hardcoding uit de build te negeren
if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
  API_BASE_URL = '';
} else if (!API_BASE_URL) {
  API_BASE_URL = 'http://localhost:5000';
}

export { API_BASE_URL };

const PIN_KEY = 'spin-pin';

export const getStoredPin = () => {
  try {
    return localStorage.getItem(PIN_KEY) || '';
  } catch {
    return '';
  }
};

export const setStoredPin = (pin) => {
  try {
    if (pin) localStorage.setItem(PIN_KEY, pin);
    else localStorage.removeItem(PIN_KEY);
  } catch {
    // storage unavailable (private mode): the PIN is asked again next time
  }
};

const withPinHeader = (pin = getStoredPin()) => (pin ? { headers: { 'X-App-Pin': pin } } : {});

// Thin wrapper so every request gets the base URL and, when known, the PIN
export const api = {
  get: (url) => axios.get(API_BASE_URL + url, withPinHeader()),
  post: (url, body = {}, pin) => axios.post(API_BASE_URL + url, body, withPinHeader(pin)),
  put: (url, body = {}) => axios.put(API_BASE_URL + url, body, withPinHeader())
};

export const isPinError = (error) => error?.response?.data?.pin_required === true;
