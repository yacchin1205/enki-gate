import { useEffect, useState } from "react";
import {
  collection,
  type FirestoreError,
  onSnapshot,
  query,
  where,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { COLLECTIONS, type CredentialDocument } from "@enki-gate/domain";
import { db } from "../lib/firebase";

type OwnedCredential = CredentialDocument & {
  id: string;
};

function fromSnapshot(snapshot: QueryDocumentSnapshot): OwnedCredential {
  const data = snapshot.data();
  return {
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
  };
}

export function useOwnedCredentials(ownerUid: string | null) {
  const [credentials, setCredentials] = useState<OwnedCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ownerUid === null) {
      setCredentials([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const credentialsQuery = query(collection(db, COLLECTIONS.credentials), where("ownerUid", "==", ownerUid));

    return onSnapshot(
      credentialsQuery,
      (snapshot) => {
        setCredentials(snapshot.docs.map(fromSnapshot));
        setLoading(false);
      },
      (snapshotError: FirestoreError) => {
        setCredentials([]);
        setError(snapshotError.message);
        setLoading(false);
      },
    );
  }, [ownerUid]);

  return { credentials, loading, error };
}
