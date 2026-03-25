import { useEffect, useMemo, useState } from "react";
import {
  collection,
  type DocumentData,
  type FirestoreError,
  onSnapshot,
  query,
  type QueryDocumentSnapshot,
  where,
} from "firebase/firestore";
import { COLLECTIONS, type CredentialDocument } from "@enki-gate/domain";
import { db } from "../lib/firebase";

type AvailableCredential = CredentialDocument & {
  id: string;
};

type CredentialBuckets = {
  owned: AvailableCredential[];
  grantedToUser: AvailableCredential[];
  grantedToDomain: AvailableCredential[];
};

function toCredential(snapshot: QueryDocumentSnapshot<DocumentData>): AvailableCredential {
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

function mergeCredentials(buckets: CredentialBuckets) {
  return Array.from(
    new Map(
      [...buckets.owned, ...buckets.grantedToUser, ...buckets.grantedToDomain].map((credential) => [
        credential.id,
        credential,
      ]),
    ).values(),
  );
}

export function useAvailableCredentials(uid: string | null, email: string | null) {
  const [buckets, setBuckets] = useState<CredentialBuckets>({
    owned: [],
    grantedToUser: [],
    grantedToDomain: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const domain = useMemo(() => {
    if (email === null) {
      return null;
    }

    return email.split("@")[1];
  }, [email]);

  useEffect(() => {
    if (uid === null || email === null || domain === null) {
      setBuckets({
        owned: [],
        grantedToUser: [],
        grantedToDomain: [],
      });
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    let completed = 0;
    const markLoaded = () => {
      completed += 1;
      if (completed === 3) {
        setLoading(false);
      }
    };

    const handleError = (snapshotError: FirestoreError) => {
      setBuckets({
        owned: [],
        grantedToUser: [],
        grantedToDomain: [],
      });
      setError(snapshotError.message);
      setLoading(false);
    };

    const unsubscribes = [
      onSnapshot(
        query(collection(db, COLLECTIONS.credentials), where("ownerUid", "==", uid)),
        (snapshot) => {
          setBuckets((current) => ({
            ...current,
            owned: snapshot.docs.map(toCredential),
          }));
          markLoaded();
        },
        handleError,
      ),
      onSnapshot(
        query(collection(db, COLLECTIONS.credentials), where("allowedUserEmails", "array-contains", email)),
        (snapshot) => {
          setBuckets((current) => ({
            ...current,
            grantedToUser: snapshot.docs.map(toCredential),
          }));
          markLoaded();
        },
        handleError,
      ),
      onSnapshot(
        query(collection(db, COLLECTIONS.credentials), where("allowedDomains", "array-contains", domain)),
        (snapshot) => {
          setBuckets((current) => ({
            ...current,
            grantedToDomain: snapshot.docs.map(toCredential),
          }));
          markLoaded();
        },
        handleError,
      ),
    ];

    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, [domain, email, uid]);

  return {
    credentials: mergeCredentials(buckets),
    loading,
    error,
  };
}
