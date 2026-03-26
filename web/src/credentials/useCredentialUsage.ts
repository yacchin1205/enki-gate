import { useEffect, useState } from "react";
import {
  doc,
  type FirestoreError,
  onSnapshot,
} from "firebase/firestore";
import { COLLECTIONS, type CredentialUsageDocument } from "@enki-gate/domain";
import { db } from "../lib/firebase";

type CredentialUsageRecord = CredentialUsageDocument;

export function useCredentialUsage(ownerUid: string | null, credentialId: string | undefined) {
  const [usage, setUsage] = useState<CredentialUsageRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ownerUid === null || credentialId === undefined) {
      setUsage(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    return onSnapshot(
      doc(db, COLLECTIONS.credentialUsages, credentialId),
      (snapshot) => {
        if (!snapshot.exists()) {
          setUsage({
            credentialId,
            ownerUid,
            lastAccessAt: undefined,
            usageSummary7d: [],
            usageUpdatedAt: undefined,
          });
          setLoading(false);
          return;
        }

        const data = snapshot.data();
        setUsage({
          credentialId: data.credentialId,
          ownerUid: data.ownerUid,
          lastAccessAt: data.lastAccessAt?.toDate(),
          usageSummary7d: Array.isArray(data.usageSummary7d) ? data.usageSummary7d : [],
          usageUpdatedAt: data.usageUpdatedAt?.toDate(),
        });
        setLoading(false);
      },
      (snapshotError: FirestoreError) => {
        setUsage(null);
        setError(snapshotError.message);
        setLoading(false);
      },
    );
  }, [credentialId, ownerUid]);

  return { usage, loading, error };
}
