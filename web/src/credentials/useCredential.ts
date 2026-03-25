import { useEffect, useState } from "react";
import {
  doc,
  type FirestoreError,
  onSnapshot,
} from "firebase/firestore";
import { COLLECTIONS, type CredentialDocument } from "@enki-gate/domain";
import { db } from "../lib/firebase";

type CredentialRecord = CredentialDocument & {
  id: string;
};

export function useCredential(credentialId: string | undefined) {
  const [credential, setCredential] = useState<CredentialRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (credentialId === undefined) {
      setCredential(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    return onSnapshot(
      doc(db, COLLECTIONS.credentials, credentialId),
      (snapshot) => {
        if (!snapshot.exists()) {
          setCredential(null);
          setLoading(false);
          return;
        }

        const data = snapshot.data();
        setCredential({
          id: snapshot.id,
          ownerUid: data.ownerUid,
          ownerEmail: data.ownerEmail,
          provider: data.provider,
          label: data.label,
          status: data.status,
          allowedUserEmails: data.allowedUserEmails,
          allowedDomains: data.allowedDomains,
          createdAt: data.createdAt.toDate(),
          updatedAt: data.updatedAt.toDate(),
          disabledAt: data.disabledAt ? data.disabledAt.toDate() : undefined,
        });
        setLoading(false);
      },
      (snapshotError: FirestoreError) => {
        setCredential(null);
        setError(snapshotError.message);
        setLoading(false);
      },
    );
  }, [credentialId]);

  return { credential, loading, error };
}
