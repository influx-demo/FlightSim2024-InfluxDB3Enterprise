import React from 'react';
import styles from './Notice.module.css';
import { InfoIcon, WarningIcon, ErrorIcon, SuccessIcon } from './icons/Icons';

type NoticeType = 'info' | 'warning' | 'error' | 'success';

interface NoticeProps {
  children: React.ReactNode;
  type?: NoticeType;
  icon?: boolean;
  className?: string;
}

export default function Notice({ 
  children, 
  type = 'info', 
  icon = true,
  className = ''
}: NoticeProps) {
  const getIcon = () => {
    if (!icon) return null;
    
    switch (type) {
      case 'info':
        return <InfoIcon className={styles.icon} />;
      case 'warning':
        return <WarningIcon className={styles.icon} />;
      case 'error':
        return <ErrorIcon className={styles.icon} />;
      case 'success':
        return <SuccessIcon className={styles.icon} />;
      default:
        return null;
    }
  };

  return (
    <div className={`${styles.notice} ${styles[type]} ${className}`}>
      {icon && <div className={styles.iconContainer}>{getIcon()}</div>}
      <div className={styles.content}>{children}</div>
    </div>
  );
}
