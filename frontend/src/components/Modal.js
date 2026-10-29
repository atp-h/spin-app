import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

// Centered dialog; closes on Escape and on a click outside the panel.
// Rendered into <body> so blurred (backdrop-filter) ancestors cannot clip it.
function Modal({ title, onClose, children, className = '' }) {
  useEffect(() => {
    const onKeyDown = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal-panel ${className}`} role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Sluiten">✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>,
    document.body
  );
}

export default Modal;
