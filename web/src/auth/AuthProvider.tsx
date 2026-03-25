import { onAuthStateChanged, type User } from "firebase/auth";
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { COLLECTIONS } from "@enki-gate/domain";
import { auth, db } from "../lib/firebase";

type AuthContextValue = {
  user: User | null;
  ready: boolean;
  error: string | null;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  ready: false,
  error: null,
});

function userDomain(email: string) {
  return email.split("@")[1];
}

async function syncUserDocument(user: User) {
  if (user.email === null) {
    throw new Error("Authenticated user must have an email address.");
  }

  const ref = doc(db, COLLECTIONS.users, user.uid);
  const snapshot = await getDoc(ref);
  const createdAt = snapshot.exists() ? snapshot.data().createdAt : serverTimestamp();

  await setDoc(ref, {
    email: user.email,
    domain: userDomain(user.email),
    displayName: user.displayName ?? "",
    photoURL: user.photoURL ?? "",
    createdAt,
    updatedAt: serverTimestamp(),
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setError(null);

      try {
        if (nextUser !== null) {
          await syncUserDocument(nextUser);
        }
      } catch (caught: unknown) {
        setError((caught as Error).message);
      }

      setReady(true);
    });
  }, []);

  return (
    <AuthContext.Provider value={{ user, ready, error }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
