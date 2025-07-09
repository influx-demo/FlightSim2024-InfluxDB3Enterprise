import React, { useEffect, useState } from 'react';
import { useConfig } from '@/contexts/ConfigContext';
import styles from './PilotName.module.css';

interface PilotNameProps {
  initialName?: string;
  onSubmit?: (name: string) => void;
  className?: string;
}

const PilotName: React.FC<PilotNameProps> = ({ initialName = '', onSubmit, className }) => {
  const { gamificationEnabled } = useConfig();
  const [name, setName] = useState(initialName);

  const [pilotNameFading, setPilotNameFading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    if(!gamificationEnabled) return;
    e.preventDefault();
    if (onSubmit) onSubmit(name);
    try {
      const resp = await fetch('/api/influxdb/flightsession', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pilotName: name })
      });
      const data = await resp.json();
      if (data.success) {
        console.log('Pilot name saved to InfluxDB');
        // Fade out and blank input only for non-modal form
        if (!showModal) {
          setPilotNameFading(true);
          setTimeout(() => {
            setPilotNameFading(false);
            setName('');
          }, 200);
        }
        closeModal(); // Always close modal after submit
        notifySessionsUpdate(); // Let sessions page know to update
      } else {
        console.error('Failed to save pilot name:', data.error);
      }
    } catch (err) {
      console.error('Error submitting pilot name:', err);
    }
  };


  // Poll http://localhost:3000/api/influxdb/bucket/flightsim/measurements/flying every 5 seconds
  // Launch a modal if flying is false and prompt for a new pilot name
  const [showModal, setShowModal] = useState(false);
  const [userDismissed, setUserDismissed] = useState(false);
  const [lastFlying, setLastFlying] = useState(true); // Assume flying at start to avoid showing modal on load

  // Poll flying status and control modal logic
  useEffect(() => {
    if(!gamificationEnabled) return;
    const interval = setInterval(() => {
      fetch('/api/influxdb/flying')
        .then(response => response.json())
        .then(data => {
          const flying = !!data.flying;
          // If flying transitions from true to false, allow modal to be shown again
          if (lastFlying && !flying) {
            setUserDismissed(false);
          }
          setLastFlying(flying);
          // Only open the modal if flying is false and user hasn't dismissed, but do not close it automatically if flying resumes
          if (!flying && !userDismissed) {
            setShowModal(true);
          }
          // Do NOT setShowModal(false) here when flying resumes; modal stays open until user closes
        })
        .catch(error => console.error('Error fetching flight data:', error));
    }, 5000);
    return () => clearInterval(interval);
  }, [userDismissed, lastFlying, gamificationEnabled]);

  // Helper to close modal after submit or close
  const closeModal = () => {
    setShowModal(false);
    setUserDismissed(true);
  };

  // Notify parent to update sessions (if callback provided)
  const notifySessionsUpdate = () => {
    if(!gamificationEnabled) return;
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sessionsUpdate'));
    }
  };

  if(!gamificationEnabled) return null;

  return (
    <>
      <form
        onSubmit={handleSubmit}
        className={
          (className ? `${styles.pilotNameContainer} ${className}` : styles.pilotNameContainer) +
          (pilotNameFading ? ` ${styles.pilotNameFading}` : '')
        }
      >
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Enter pilot name"
          className={styles.pilotInput}
        />
        <button type="submit" className={styles.pilotButton} disabled={!lastFlying} title="Pilot name can be set once in flight">
          Set
        </button>
      </form>
      {showModal && (
        <div className={styles.modal} style={{ display: 'flex' }}>
          <div className={styles.modalContent}>
            <span className={styles.close} onClick={closeModal}>&times;</span>
            <p>Flight is paused. Please enter next pilot&apos;s name and submit after flight starts.</p>
            <form onSubmit={handleSubmit}>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Enter pilot name"
                className={styles.pilotInput}
              />
              <button type="submit" className={styles.pilotButton} disabled={!lastFlying} title="Pilot name can be set once in flight">
                Set
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default PilotName;
