import type {
  GrantUsagePoint,
  CredentialDocument,
  CredentialSecretDocument,
  CredentialUsageDocument,
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

export type StoredCredentialUsageDocument = Omit<CredentialUsageDocument, "lastAccessAt" | "usageUpdatedAt"> & {
  lastAccessAt?: Timestamp;
  usageUpdatedAt?: Timestamp;
  usageSummary7d: GrantUsagePoint[];
};

export type StoredGrantDocument = Omit<GrantDocument, "createdAt" | "updatedAt" | "revokedAt" | "lastAccessAt" | "usageUpdatedAt"> & {
  createdAt: Timestamp;
  updatedAt: Timestamp;
  revokedAt?: Timestamp;
  lastAccessAt?: Timestamp;
  usageUpdatedAt?: Timestamp;
  usageSummary7d: GrantUsagePoint[];
};

export type StoredDeviceFlowDocument = Omit<DeviceFlowDocument, "createdAt" | "expiresAt" | "authorizedAt" | "completedAt"> & {
  createdAt: Timestamp;
  expiresAt: Timestamp;
  authorizedAt?: Timestamp;
  completedAt?: Timestamp;
};

export type StoredTokenIssuanceDocument = Omit<TokenIssuanceDocument, "issuedAt" | "expiresAt"> & {
  issuedAt: Timestamp;
  expiresAt: Timestamp;
};
