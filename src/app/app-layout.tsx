"use client";

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useConfig } from '@/contexts/ConfigContext';
import { InfluxDBIcon } from '@/components/ui/icons';
import styles from './layout.module.css';

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { activeBucket, isLoading, gamificationEnabled } = useConfig();
  const pathname = usePathname();
  
  // If still loading or not configured, show loading indicator
  if (isLoading) {
    return (
      <div className={styles.dashboard}>
        <div className={styles.header}>
          <div className={styles.logo}>
            <h1><InfluxDBIcon size={32} className={styles.logoIcon} /> FlightSim Demo </h1>
          </div>
        </div>
        <div className={styles.content}>
          <div className={styles.tabContainer}>
            <div>Loading configuration...</div>
          </div>
        </div>
      </div>
    );
  }

  // Helper to check if a tab is active
  const isActive = (path: string) => {
    return pathname.startsWith(`/${path}`);
  };

  return (
    <div className={styles.dashboard}>
      <div className={styles.header}>
        <div className={styles.logo}>
          <h1><InfluxDBIcon size={32} className={styles.logoIcon} /> FlightSim Demo </h1>
        </div>
      </div>
      <div className={styles.content}>
        <div className={styles.tabs}>
          <Link 
            href="/buckets" 
            className={`${styles.tabButton} ${isActive('buckets') ? styles.active : ''}`}
          >
            Buckets
          </Link>
          {activeBucket ? (
            <Link 
              href="/data" 
              className={`${styles.tabButton} ${isActive('data') ? styles.active : ''}`}
            >
              Data
            </Link>
          ) : (
            <span 
              className={`${styles.tabButton} ${styles.disabled}`}
              title="No active bucket available. Please select a bucket with data first."
            >
              Data
            </span>
          )}
          {activeBucket ? (
            <Link 
              href="/cockpit" 
              className={`${styles.tabButton} ${isActive('cockpit') ? styles.active : ''}`}
            >
              Cockpit
            </Link>
          ) : (
            <span 
              className={`${styles.tabButton} ${styles.disabled}`}
              title="No active bucket available. Please select a bucket with data first."
            >
              Cockpit
            </span>
          )}
          {gamificationEnabled && activeBucket ? (
            <Link
              href="/sessions"
              className={`${styles.tabButton} ${isActive('sessions') ? styles.active : ''}`}
            >
              Sessions
            </Link>
          ) : gamificationEnabled && (
            <span
              className={`${styles.tabButton} ${styles.disabled}`}
              title="No active bucket available. Please select a bucket with data first."
            >
              Sessions
            </span>
          )}
        </div>
        <div className={styles.tabContainer}>
          {children}
        </div>
      </div>
    </div>
  );
}
