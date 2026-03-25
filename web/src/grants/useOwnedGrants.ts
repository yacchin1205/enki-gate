import { useEffect, useState } from "react";
import {
  collection,
  type FirestoreError,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { COLLECTIONS, type GrantDocument } from "@enki-gate/domain";
import { db } from "../lib/firebase";

type OwnedGrant = GrantDocument & {
  id: string;
};

export function useOwnedGrants(ownerUid: string | null, credentialId: string | undefined) {
  const [grants, setGrants] = useState<OwnedGrant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ownerUid === null || credentialId === undefined) {
      setGrants([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const grantsQuery = query(
      collection(db, COLLECTIONS.grants),
      where("ownerUid", "==", ownerUid),
      where("credentialId", "==", credentialId),
    );

    return onSnapshot(
      grantsQuery,
      (snapshot) => {
        setGrants(
          snapshot.docs.map((docSnapshot) => {
            const data = docSnapshot.data();
            return {
              id: docSnapshot.id,
              credentialId: data.credentialId,
              ownerUid: data.ownerUid,
              granteeType: data.granteeType,
              granteeValue: data.granteeValue,
              status: data.status === "revoked" ? "revoked" : "active",
              createdAt: data.createdAt.toDate(),
              updatedAt: data.updatedAt ? data.updatedAt.toDate() : data.createdAt.toDate(),
              revokedAt: data.revokedAt?.toDate(),
              lastAccessAt: data.lastAccessAt?.toDate(),
              usageSummary7d: Array.isArray(data.usageSummary7d) ? data.usageSummary7d : [],
              usageUpdatedAt: data.usageUpdatedAt?.toDate(),
            };
          }),
        );
        setLoading(false);
      },
      (snapshotError: FirestoreError) => {
        setGrants([]);
        setError(snapshotError.message);
        setLoading(false);
      },
    );
  }, [credentialId, ownerUid]);

  return { grants, loading, error };
}
