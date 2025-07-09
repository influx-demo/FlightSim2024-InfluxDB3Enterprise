"use client";

import { useState, FormEvent, useEffect, useRef } from 'react';
import { useConfig } from '@/contexts/ConfigContext';
import Button from '@/components/ui/Button';
import styles from './CreateBucketForm.module.css';

interface CreateBucketFormProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export default function CreateBucketForm({ onSuccess, onCancel }: CreateBucketFormProps) {
  const { createBucket } = useConfig();
  const [bucketName, setBucketName] = useState<string>('flightsim');
  const [retentionPeriod, setRetentionPeriod] = useState<string>('24');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  // Create a ref for the bucket name input field
  const bucketNameInputRef = useRef<HTMLInputElement>(null);
  
  // Select the text in the bucket name input field when the component mounts
  useEffect(() => {
    if (bucketNameInputRef.current) {
      bucketNameInputRef.current.focus();
      bucketNameInputRef.current.select();
    }
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      // Validate inputs
      if (!bucketName.trim()) {
        throw new Error('Bucket name is required');
      }

      const retention = retentionPeriod ? parseInt(retentionPeriod, 10) : undefined;
      if (retention !== undefined && (isNaN(retention) || retention < 1)) {
        throw new Error('Retention period must be a positive number');
      }

      // Create the bucket
      await createBucket(bucketName, retention);
      
      // Call the success callback
      onSuccess();
    } catch (err) {
      console.error('Error creating bucket:', err);
      setError(err instanceof Error ? err.message : 'Failed to create bucket');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      {error && <div className={styles.error}>{error}</div>}
      
      <div className={styles.formGroup}>
        <label htmlFor="bucketName" className={styles.label}>Bucket Name</label>
        <input
          id="bucketName"
          type="text"
          value={bucketName}
          onChange={(e) => setBucketName(e.target.value)}
          className={styles.input}
          placeholder="Enter bucket name"
          disabled={isSubmitting}
          required
          ref={bucketNameInputRef}
        />
      </div>
      
      <div className={styles.formGroup}>
        <label htmlFor="retentionPeriod" className={styles.label}>Retention Period (hours)</label>
        <input
          id="retentionPeriod"
          type="number"
          value={retentionPeriod}
          onChange={(e) => setRetentionPeriod(e.target.value)}
          className={styles.input}
          placeholder="Enter retention period in hours"
          min="1"
          disabled={isSubmitting}
        />
        <div className={styles.hint}>Leave empty for infinite retention</div>
      </div>
      
      <div className={styles.actions}>
        <Button 
          type="button" 
          variant="outline" 
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button 
          type="submit" 
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Creating...' : 'Create Bucket'}
        </Button>
      </div>
    </form>
  );
}
