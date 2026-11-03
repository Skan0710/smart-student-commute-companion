import React, { useEffect, useState } from 'react';
import { Modal } from './ui';
import ThankYouPanel from './ThankYouPanel.jsx';
import { THANK_YOU_EVENT } from '../utils/thankYou.js';
import { THANK_YOU_TYPES } from '../content/thankYou.js';

/**
 * ThankYouHost - shows the confirmation dialog after a successful submission
 *
 * Mounted once in the app shell. Forms call announceThankYou(type); this
 * listens and opens the shared confirmation in the standard Modal (focus trap,
 * Escape to close, focus returned to the trigger).
 *
 * @param {Object} props
 * @param {(screenId: string) => void} [props.onNavigate]
 */
export default function ThankYouHost({ onNavigate }) {
  const [type, setType] = useState(null);

  useEffect(() => {
    const onThankYou = (event) => {
      const next = event?.detail?.type;
      if (THANK_YOU_TYPES.includes(next)) setType(next);
    };
    window.addEventListener(THANK_YOU_EVENT, onThankYou);
    return () => window.removeEventListener(THANK_YOU_EVENT, onThankYou);
  }, []);

  const close = () => setType(null);

  return (
    <Modal isOpen={Boolean(type)} onClose={close} title="Submission received" size="md">
      <div className="p-5 sm:p-6">
        <ThankYouPanel type={type} onNavigate={onNavigate} onDone={close} autoFocus={false} />
      </div>
    </Modal>
  );
}
