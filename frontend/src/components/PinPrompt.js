import React, { useState } from 'react';
import Modal from './Modal';
import { api, setStoredPin } from '../api';
import { errorMessage } from '../utils';

// Asks for the shared password (APP_PIN) and checks it with the server before storing it
function PinPrompt({ onDone }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!pin) return;
    setChecking(true);
    try {
      await api.post('/api/auth/check', {}, pin);
      setStoredPin(pin);
      onDone(true);
    } catch (err) {
      setError(errorMessage(err));
      setPin('');
    } finally {
      setChecking(false);
    }
  };

  return (
    <Modal title="🔒 Wachtwoord nodig" onClose={() => onDone(false)} className="pin-modal">
      <form onSubmit={submit} className="pin-form">
        <p>Spelers, teams, wedstrijden en raderen verwijderen en een nieuwe avond starten zijn beveiligd. Vul het wachtwoord in.</p>
        <input
          type="password"
          autoComplete="off"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          aria-label="Wachtwoord"
          autoFocus
        />
        {error && <p className="form-hint">{error}</p>}
        <button type="submit" className="btn-primary" disabled={!pin || checking}>
          {checking ? 'Controleren…' : 'Ontgrendel'}
        </button>
      </form>
    </Modal>
  );
}

export default PinPrompt;
