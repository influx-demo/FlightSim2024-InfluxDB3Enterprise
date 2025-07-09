"use client";

import React, { useEffect, useState } from 'react';
import AppLayout from '../app-layout';
import PilotName from '../components/PilotName';
import styles from './sessions.module.css';

const SessionsPage = () => {

    const [sessions, setSessions] = useState([]);
    useEffect(() => {
        const fetchSessions = () => {
            fetch('/api/influxdb/flightsession')
                .then(response => response.json())
                .then(data => setSessions(data.sessions));
        };
        fetchSessions();
        const handleUpdate = () => fetchSessions();
        window.addEventListener('sessionsUpdate', handleUpdate);
        return () => window.removeEventListener('sessionsUpdate', handleUpdate);
    }, []);

    return (
        <AppLayout>
            <div className={styles.tabContent}>
                <div className={styles.headerRow}>
                    <h2 className={styles.headerTitle}>Sessions</h2>
                    <PilotName />
                </div>
                <div className={styles.card}>
                    <div className={styles.cardHeader}>
                        <h3 className={styles.cardTitle}>Sessions ({sessions.length})</h3>
                    </div>
                    <div className={styles.cardContent}>
                        {sessions.length > 0 ? (
                            <table className={styles.sessionsTable}>
                                <thead>
                                    <tr>
                                        <th>Pilot&apos;s Name</th>
                                        <th className={styles.centre}>Flight Time</th>
                                        <th className={styles.right}>Timestamp</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                    {sessions.filter((session: any) => session.anonymous === false).map((session: any) => (
                                        <tr key={session.time}>
                                            <td>{session.pilot_name}</td>
                                            <td className={styles.centre}>{session.flight_time > 0 ? session.flight_time : 'pending'}</td>
                                            <td className={styles.right}>{session.time}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <p>No sessions found.</p>
                        )}
                    </div>
                </div>
            </div>
        </AppLayout>
    );
};

export default SessionsPage;
