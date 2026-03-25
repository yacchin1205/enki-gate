import type {
  CredentialDocument,
  CredentialSecretDocument,
  DeviceFlowDocument,
  GrantDocument,
  TokenIssuanceDocument,
} from "./domain.js";
import { Timestamp } from "firebase-admin/firestore";

export type StoredCredentialDocument = Omit<CredentialDocument, "createdAt" | "updatedAt" | "disabledAt"> & {
  createdAt: Timestamp;
  updatedAt: Timestamp;
  disabledAt?: Timestamp;
};

export type StoredCredentialSecretDocument = Omit<CredentialSecretDocument, "createdAt" | "updatedAt"> & {
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type StoredGrantDocument = Omit<GrantDocument, "createdAt"> & {
  createdAt: Timestamp;
};

export type StoredTokenIssuanceDocument = Omit<TokenIssuanceDocument, "issuedAt" | "expiresAt"> & {
  issuedAt: Timestamp;
  expiresAt: Timestamp;
};

export type StoredDeviceFlowDocument = Omit<DeviceFlowDocument, "createdAt" | "expiresAt" | "authorizedAt" | "completedAt"> & {
  createdAt: Timestamp;
  expiresAt: Timestamp;
  authorizedAt?: Timestamp;
  completedAt?: Timestamp;
};
