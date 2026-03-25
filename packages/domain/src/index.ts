export const COLLECTIONS = {
  users: "users",
  credentials: "credentials",
  credentialSecrets: "credential_secrets",
  grants: "grants",
  tokenIssuances: "token_issuances",
  deviceFlows: "device_flows",
} as const;

export const DEVICE_FLOW_EXPIRES_IN_SECONDS = 600;
export const DEVICE_FLOW_POLL_INTERVAL_SECONDS = 5;
export const GATEWAY_TOKEN_EXPIRES_IN_SECONDS = 3600;

export type CredentialProvider = "openai" | "anthropic";
export type ResourceStatus = "active" | "disabled";
export type GrantStatus = "active" | "revoked";
export type GrantGranteeType = "user_email" | "email_domain";
export type DeviceFlowStatus = "pending" | "authorized" | "completed" | "expired";
export type AccessScopeType = "owner" | "user_email" | "email_domain";

export type GrantUsagePoint = {
  dateKey: string;
  requestCount: number;
};

export type UserDocument = {
  email: string;
  domain: string;
  displayName: string;
  photoURL: string;
  createdAt: Date;
  updatedAt: Date;
};

export type CredentialDocument = {
  ownerUid: string;
  ownerEmail: string;
  provider: CredentialProvider;
  label: string;
  status: ResourceStatus;
  allowedUserEmails: string[];
  allowedDomains: string[];
  createdAt: Date;
  updatedAt: Date;
  disabledAt?: Date;
};

export type CredentialSecretDocument = {
  ownerUid: string;
  ciphertext: string;
  wrappedDek: string;
  kmsKeyName: string;
  createdAt: Date;
  updatedAt: Date;
};

export type GrantDocument = {
  credentialId: string;
  ownerUid: string;
  granteeType: GrantGranteeType;
  granteeValue: string;
  status: GrantStatus;
  createdAt: Date;
  updatedAt: Date;
  revokedAt?: Date;
  lastAccessAt?: Date;
  usageSummary7d: GrantUsagePoint[];
  usageUpdatedAt?: Date;
};

export type TokenIssuanceDocument = {
  actorUid: string;
  actorEmail: string;
  credentialId: string;
  credentialOwnerUid: string;
  accessScopeType: AccessScopeType;
  accessScopeValue?: string;
  grantId?: string;
  tokenHash: string;
  issuedAt: Date;
  expiresAt: Date;
};

export type DeviceFlowDocument = {
  deviceCode: string;
  userCode: string;
  status: DeviceFlowStatus;
  credentialId?: string;
  credentialOwnerUid?: string;
  actorUid?: string;
  actorEmail?: string;
  accessScopeType?: AccessScopeType;
  accessScopeValue?: string;
  grantId?: string;
  tokenHash?: string;
  createdAt: Date;
  expiresAt: Date;
  authorizedAt?: Date;
  completedAt?: Date;
};

export type DeviceFlowStartResponse = {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
};

export type DeviceFlowPollPendingResponse = {
  status: "pending";
};

export type DeviceFlowPollCompletedResponse = {
  status: "completed";
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
};

export type DeviceFlowPollResponse =
  | DeviceFlowPollPendingResponse
  | DeviceFlowPollCompletedResponse;

export type CreateCredentialRequest = {
  provider: CredentialProvider;
  label: string;
  apiKey: string;
};

export type CreateGrantRequest = {
  granteeType: GrantGranteeType;
  granteeValue: string;
};
