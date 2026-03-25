import type { CreateCredentialRequest, CreateGrantRequest } from "@enki-gate/domain";
import { auth } from "../lib/firebase";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "";

async function authorizedHeaders() {
  const user = auth.currentUser;
  if (user === null) {
    throw new Error("Authentication is required.");
  }

  const idToken = await user.getIdToken();
  return {
    authorization: `Bearer ${idToken}`,
  };
}

async function parseJson(response: Response) {
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}.`);
  }

  return response.json();
}

export async function createCredential(input: CreateCredentialRequest) {
  const headers = await authorizedHeaders();
  const response = await fetch(`${apiBaseUrl}/api/credentials`, {
    method: "POST",
    headers: {
      ...headers,
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  });

  return parseJson(response);
}

export async function disableCredential(credentialId: string) {
  const headers = await authorizedHeaders();
  const response = await fetch(`${apiBaseUrl}/api/credentials/${credentialId}/disable`, {
    method: "POST",
    headers,
  });

  return parseJson(response);
}

export async function createGrant(credentialId: string, input: CreateGrantRequest) {
  const headers = await authorizedHeaders();
  const response = await fetch(`${apiBaseUrl}/api/credentials/${credentialId}/grants`, {
    method: "POST",
    headers: {
      ...headers,
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  });

  return parseJson(response);
}

export async function revokeGrant(grantId: string) {
  const headers = await authorizedHeaders();
  const response = await fetch(`${apiBaseUrl}/api/grants/${grantId}/revoke`, {
    method: "POST",
    headers,
  });

  return parseJson(response);
}

export async function authorizeDeviceFlow(input: {
  userCode: string;
  credentialId: string;
}) {
  const headers = await authorizedHeaders();
  const response = await fetch(`${apiBaseUrl}/api/device-authorizations`, {
    method: "POST",
    headers: {
      ...headers,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      user_code: input.userCode,
      credential_id: input.credentialId,
    }),
  });

  return parseJson(response);
}

export async function getDeviceFlowStatus(userCode: string) {
  const response = await fetch(`${apiBaseUrl}/api/device-flows/${encodeURIComponent(userCode)}/status`);
  return parseJson(response) as Promise<{ status: "pending" | "authorized" | "completed" | "expired" }>;
}
