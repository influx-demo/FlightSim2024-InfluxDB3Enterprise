"use client";

import { useState, useEffect } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Notice from '@/components/ui/Notice';
import styles from './TokenModal.module.css';
import { TrashIcon } from '@/components/ui/icons';

interface TokenModalProps {
  isOpen: boolean;
  onClose: () => void;
  bucketName: string;
}

export default function TokenModal({ isOpen, onClose, bucketName }: TokenModalProps) {
  const [token, setToken] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [existingTokens, setExistingTokens] = useState<any[]>([]);
  const [isLoadingTokens, setIsLoadingTokens] = useState<boolean>(false);

  // Check if we already have a token for this bucket and fetch existing tokens
  useEffect(() => {
    if (isOpen && bucketName) {
      fetchToken();
      fetchExistingTokens();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, bucketName]);

  const fetchToken = async () => {
    setIsLoading(true);
    setError(null);
    setToken('');
    setCopied(false);

    try {
      const response = await fetch(`/api/influxdb/token?bucket=${encodeURIComponent(bucketName)}`);
      const data = await response.json();

      if (data.success) {
        setToken(data.token);
      } else {
        // No token yet, but that's not an error
        if (response.status === 404) {
          setToken('');
        } else {
          setError(data.error || 'Failed to retrieve token');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to retrieve token');
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch existing tokens for this bucket from InfluxDB
  const fetchExistingTokens = async () => {
    setIsLoadingTokens(true);
    try {
      const response = await fetch(`/api/influxdb/token?bucket=${encodeURIComponent(bucketName)}`);

      // If the response is not ok, don't try to parse it as JSON
      if (!response.ok) {
        console.warn(`Failed to fetch existing tokens: ${response.status} ${response.statusText}`);
        setExistingTokens([]);
        return;
      }

      const data = await response.json();

      if (data.success) {
        setExistingTokens(data.tokens || []);
      } else {
        // Just log the error, don't show it to the user as this is supplementary info
        console.warn('Failed to fetch existing tokens:', data.error);
        setExistingTokens([]);
      }
    } catch (err) {
      console.warn('Error fetching existing tokens:', err);
      setExistingTokens([]);
    } finally {
      setIsLoadingTokens(false);
    }
  };

  const generateToken = async () => {
    setIsGenerating(true);
    setError(null);
    setCopied(false);

    try {
      const response = await fetch('/api/influxdb/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ bucketName, tokenName: `Token for ${bucketName}` }),
      });

      const data = await response.json();

      if (data.success) {
        setToken(data.token);
        // Refresh the list of tokens after creating a new one
        fetchExistingTokens();
      } else {
        setError(data.error || 'Failed to generate token');
      }
    } catch (err) {
      console.error('Error generating token:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate token');
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(token)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 3000); // Reset after 3 seconds
      })
      .catch(err => {
        console.error('Failed to copy token:', err);
        setError('Failed to copy token to clipboard');
      });
  };

  // Delete token for this bucket
  const deleteToken = async (tokenName: string, bucketName: string) => {
    if (!tokenName) return;

    setError(null);

    try {
      // Delete the token
      const deleteResponse = await fetch(`/api/influxdb/token?tokenName=${tokenName}&bucket=${encodeURIComponent(bucketName)}`, {
        method: 'DELETE',
      });

      const deleteData = await deleteResponse.json();

      if (!deleteData.success) {
        setError(deleteData.error || 'Failed to delete token');
        return;
      }

      // Clear the token if it was the one we were displaying
      if (existingTokens.some(t => t.name === tokenName)) {
        setToken('');
      }

      // Refresh the token list
      fetchExistingTokens();

    } catch (err) {
      console.error('Error deleting token:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete token');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Token for ${bucketName}`}
      size="medium"
    >
      <div className={styles.tokenModal}>
        {error && <Notice type="error">{error}</Notice>}

        <p className={styles.description}>
          This token will have read and write permissions to the <strong>{bucketName}</strong> bucket.
          Use this token in your applications to securely access your InfluxDB data.
        </p>

        {isLoading ? (
          <div className={styles.loading}>Loading token information...</div>
        ) : (token || existingTokens.length) ? (
          <div className={styles.tokenContainer}>
            <h3 className={styles.existingTokensTitle}>Your Current Token</h3>

            <div className={styles.tokensList}>
              {isLoadingTokens ? (
                <p>Loading existing tokens...</p>
              ) : (
                <ul>
                  {existingTokens.map((tokenItem, index) => (
                    <li key={tokenItem.id || index} className={styles.tokenItem}>
                      <div className={styles.tokenHeader}>
                        <div className={styles.tokenName}>{tokenItem.name || 'Unnamed Token'}</div>
                        <button
                          className={styles.deleteTokenButton}
                          onClick={() => tokenItem.name && deleteToken(tokenItem.name, bucketName)}
                          title="Delete Token"
                        >
                          <TrashIcon size={16} />
                        </button>
                      </div>
                      {tokenItem.description && <div className={styles.tokenDescription}>{tokenItem.description}</div>}
                      <div className={styles.tokenDate}>Created: {tokenItem.created_at ? new Date(tokenItem.created_at).toUTCString() : 'Unknown'}</div>
                      <div className={styles.tokenDate}>Expires: {tokenItem.expiry ? new Date(tokenItem.expiry).toUTCString() : 'Unknown'}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {token ? (
              <>
                <div className={styles.tokenDisplay}>
                  <pre className={styles.token}>{token}</pre>
                </div>
                <Button
                  onClick={copyToClipboard}
                  variant='primary'
                  className={`${styles.copyButton} ${copied ? styles.copied : ''}`}
                >
                  {copied ? 'Copied!' : 'Copy Token'}
                </Button>
              </>
            ) : (
              <>
                <p className={styles.warningText}>
                  We cannot retrieve the API Key for this token. Delete this token if you want to generate a new one.
                </p>
              </>
            )}
          </div>
        ) : (
          <div className={styles.generateContainer}>
            <>
              <p>No token exists for this bucket yet. Generate a new token?</p>
              <Button
                onClick={generateToken}
                disabled={isGenerating}
              >
                {isGenerating ? 'Generating...' : 'Generate Token'}
              </Button>
            </>
          </div>
        )}

        <div className={styles.actions}>
          <Button
            variant="outline"
            onClick={onClose}
          >
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
