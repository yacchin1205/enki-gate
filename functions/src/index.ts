import crypto from "node:crypto";
import { Readable } from "node:stream";
import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { onRequest, type Request } from "firebase-functions/v2/https";
import {
  COLLECTIONS,
  DEVICE_FLOW_EXPIRES_IN_SECONDS,
  DEVICE_FLOW_POLL_INTERVAL_SECONDS,
  GATEWAY_TOKEN_EXPIRES_IN_SECONDS,
  type CreateCredentialRequest,
  type CreateGrantRequest,
  type DeviceFlowPollResponse,
  type DeviceFlowStartResponse,
  type GrantGranteeType,
} from "./domain.js";
import { requireAuthenticatedUser, readGatewayBearerToken } from "./auth.js";
import { writeAuditLog } from "./audit.js";
import { HttpError, type JsonResponse, readJsonBody, sendJsonError } from "./http.js";
import { decryptProviderSecret, encryptProviderSecret } from "./kms.js";
import type {
  StoredCredentialDocument,
  StoredCredentialSecretDocument,
  StoredDeviceFlowDocument,
  StoredGrantDocument,
  StoredTokenIssuanceDocument,
} from "./models.js";
import { forwardToProvider, validateProviderApiKey } from "./providers.js";

initializeApp();

const db = getFirestore();
const region = "asia-northeast1";

function nowTimestamp() {
  return Timestamp.now();
}

function expiresAtAfter(seconds: number) {
  return Timestamp.fromMillis(Date.now() + seconds * 1000);
}

function randomCode(length: number) {
  return crypto.randomBytes(length).toString("hex").slice(0, length).toUpperCase();
}

function createUserCode() {
  return `${randomCode(4)}-${randomCode(4)}`;
}

function createDeviceCode() {
  return crypto.randomUUID();
}

function createGatewayToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function verificationUri(request: Request) {
  return `${request.protocol}://${request.get("host")}/device`;
}

function requestPath(request: Request) {
  return request.path.endsWith("/") && request.path !== "/" ? request.path.slice(0, -1) : request.path;
}

function requiredDeviceFlowIssuanceFields(deviceFlow: StoredDeviceFlowDocument) {
  if (
    deviceFlow.actorUid === undefined ||
    deviceFlow.actorEmail === undefined ||
    deviceFlow.credentialId === undefined ||
    deviceFlow.credentialOwnerUid === undefined
  ) {
    throw new HttpError(500, "device_flow_missing_authorization_fields");
  }

  return {
    actorUid: deviceFlow.actorUid,
    actorEmail: deviceFlow.actorEmail,
    credentialId: deviceFlow.credentialId,
    credentialOwnerUid: deviceFlow.credentialOwnerUid,
  };
}

function normalizedString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new HttpError(400, `invalid_${fieldName}`);
  }

  return value.trim();
}

function normalizeGrantValue(granteeType: GrantGranteeType, granteeValue: string) {
  const normalized = granteeValue.trim().toLowerCase();
  if (granteeType === "user_email") {
    if (!normalized.includes("@")) {
      throw new HttpError(400, "invalid_grantee_value");
    }

    return normalized;
  }

  if (normalized.includes("@")) {
    throw new HttpError(400, "invalid_grantee_value");
  }

  return normalized;
}

function grantIdFor(credentialId: string, granteeType: GrantGranteeType, granteeValue: string) {
  return sha256(`${credentialId}:${granteeType}:${granteeValue}`);
}

async function withHttpErrors(
  response: JsonResponse,
  handler: () => Promise<void>,
) {
  try {
    await handler();
  } catch (error) {
    if (error instanceof HttpError) {
      sendJsonError(response, error);
      return;
    }

    throw error;
  }
}

async function findDeviceFlowByDeviceCode(deviceCode: string) {
  const snapshot = await db
    .collection(COLLECTIONS.deviceFlows)
    .where("deviceCode", "==", deviceCode)
    .limit(1)
    .get();

  if (snapshot.empty) {
    throw new HttpError(404, "device_flow_not_found");
  }

  return snapshot.docs[0];
}

async function createDeviceFlowDocument() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const userCode = createUserCode();
    const deviceCode = createDeviceCode();
    const ref = db.collection(COLLECTIONS.deviceFlows).doc(userCode);
    const document: StoredDeviceFlowDocument = {
      deviceCode,
      userCode,
      status: "pending",
      createdAt: nowTimestamp(),
      expiresAt: expiresAtAfter(DEVICE_FLOW_EXPIRES_IN_SECONDS),
    };

    try {
      await ref.create(document);
      return document;
    } catch (error) {
      if (attempt === 4) {
        throw error;
      }
    }
  }

  throw new HttpError(500, "device_flow_creation_failed");
}

async function requireOwnedCredential(credentialId: string, ownerUid: string) {
  const ref = db.collection(COLLECTIONS.credentials).doc(credentialId);
  const snapshot = await ref.get();
  if (!snapshot.exists) {
    throw new HttpError(404, "credential_not_found");
  }

  const data = snapshot.data() as StoredCredentialDocument;
  if (data.ownerUid !== ownerUid) {
    throw new HttpError(403, "credential_owner_required");
  }

  return { ref, data };
}

function canUserUseCredential(
  credential: StoredCredentialDocument,
  actor: { uid: string; email: string; domain: string },
) {
  if (credential.status !== "active") {
    return false;
  }

  return (
    credential.ownerUid === actor.uid ||
    credential.allowedUserEmails.includes(actor.email) ||
    credential.allowedDomains.includes(actor.domain)
  );
}

async function loadGatewayTokenIssuance(request: Request) {
  const tokenHash = sha256(readGatewayBearerToken(request));
  const snapshot = await db
    .collection(COLLECTIONS.tokenIssuances)
    .where("tokenHash", "==", tokenHash)
    .limit(1)
    .get();

  if (snapshot.empty) {
    throw new HttpError(401, "invalid_gateway_token");
  }

  const data = snapshot.docs[0].data() as StoredTokenIssuanceDocument;
  if (data.expiresAt.toMillis() <= Date.now()) {
    throw new HttpError(401, "expired_gateway_token");
  }

  return data;
}

async function loadCredentialForIssuance(issuance: StoredTokenIssuanceDocument) {
  const [credentialSnapshot, secretSnapshot] = await Promise.all([
    db.collection(COLLECTIONS.credentials).doc(issuance.credentialId).get(),
    db.collection(COLLECTIONS.credentialSecrets).doc(issuance.credentialId).get(),
  ]);

  if (!credentialSnapshot.exists) {
    throw new HttpError(404, "credential_not_found");
  }

  if (!secretSnapshot.exists) {
    throw new HttpError(404, "credential_secret_not_found");
  }

  return {
    credential: credentialSnapshot.data() as StoredCredentialDocument,
    secret: secretSnapshot.data() as StoredCredentialSecretDocument,
  };
}

async function proxyUpstreamResponse(upstream: Response, response: JsonResponse & {
  setHeader(name: string, value: string): void;
  send(body: string): void;
  end(body?: string): void;
  write(chunk: Uint8Array | string): void;
}) {
  response.status(upstream.status);

  const contentType = upstream.headers.get("content-type");
  if (contentType !== null) {
    response.setHeader("content-type", contentType);
  }

  const cacheControl = upstream.headers.get("cache-control");
  if (cacheControl !== null) {
    response.setHeader("cache-control", cacheControl);
  }

  const openAiProcessingMs = upstream.headers.get("openai-processing-ms");
  if (openAiProcessingMs !== null) {
    response.setHeader("openai-processing-ms", openAiProcessingMs);
  }

  const anthropicRequestId = upstream.headers.get("request-id");
  if (anthropicRequestId !== null) {
    response.setHeader("request-id", anthropicRequestId);
  }

  if (upstream.body === null) {
    response.end();
    return;
  }

  if (contentType !== null && contentType.startsWith("text/event-stream")) {
    await new Promise<void>((resolve, reject) => {
      const stream = Readable.fromWeb(upstream.body as any);
      stream.on("data", (chunk) => {
        response.write(chunk);
      });
      stream.on("end", () => {
        response.end();
        resolve();
      });
      stream.on("error", reject);
    });
    return;
  }

  const text = await upstream.text();
  response.send(text);
}

async function handleStartDeviceFlow(request: Request, response: JsonResponse) {
  const document = await createDeviceFlowDocument();
  const payload: DeviceFlowStartResponse = {
    device_code: document.deviceCode,
    user_code: document.userCode,
    verification_uri: verificationUri(request),
    expires_in: DEVICE_FLOW_EXPIRES_IN_SECONDS,
    interval: DEVICE_FLOW_POLL_INTERVAL_SECONDS,
  };

  response.json(payload);
}

async function handlePollDeviceFlow(response: JsonResponse, deviceCode: string) {
  const snapshot = await findDeviceFlowByDeviceCode(deviceCode);
  const deviceFlowRef = snapshot.ref;
  const data = snapshot.data() as StoredDeviceFlowDocument;

  if (data.status === "completed") {
    throw new HttpError(409, "device_flow_completed");
  }

  if (data.expiresAt.toMillis() <= Date.now()) {
    await deviceFlowRef.update({ status: "expired" });
    throw new HttpError(410, "device_flow_expired");
  }

  if (data.status !== "authorized") {
    const pending: DeviceFlowPollResponse = { status: "pending" };
    response.json(pending);
    return;
  }

  const accessToken = createGatewayToken();
  const issuanceFields = requiredDeviceFlowIssuanceFields(data);
  const tokenHash = sha256(accessToken);
  const issuedAt = nowTimestamp();
  const expiresAt = expiresAtAfter(GATEWAY_TOKEN_EXPIRES_IN_SECONDS);
  const issuanceRef = db.collection(COLLECTIONS.tokenIssuances).doc();

  await db.runTransaction(async (transaction) => {
    transaction.create(issuanceRef, {
      actorUid: issuanceFields.actorUid,
      actorEmail: issuanceFields.actorEmail,
      credentialId: issuanceFields.credentialId,
      credentialOwnerUid: issuanceFields.credentialOwnerUid,
      tokenHash,
      issuedAt,
      expiresAt,
    } satisfies StoredTokenIssuanceDocument);
    transaction.update(deviceFlowRef, {
      status: "completed",
      tokenHash,
      completedAt: issuedAt,
    });
  });

  writeAuditLog({
    actorUid: issuanceFields.actorUid,
    actorEmail: issuanceFields.actorEmail,
    credentialId: issuanceFields.credentialId,
    credentialOwnerUid: issuanceFields.credentialOwnerUid,
    eventType: "device_flow_completed",
    result: "success",
  });

  const completed: DeviceFlowPollResponse = {
    status: "completed",
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: GATEWAY_TOKEN_EXPIRES_IN_SECONDS,
  };

  response.json(completed);
}

async function handleCreateCredential(request: Request, response: JsonResponse) {
  const actor = await requireAuthenticatedUser(request);
  const body = readJsonBody<CreateCredentialRequest>(request);
  const provider = body.provider;
  const label = normalizedString(body.label, "label");
  const apiKey = normalizedString(body.apiKey, "api_key");

  await validateProviderApiKey(provider, apiKey);
  const encryptedSecret = await encryptProviderSecret(apiKey);
  const credentialRef = db.collection(COLLECTIONS.credentials).doc();
  const now = nowTimestamp();

  await db.runTransaction(async (transaction) => {
    transaction.create(credentialRef, {
      ownerUid: actor.uid,
      ownerEmail: actor.email,
      provider,
      label,
      status: "active",
      allowedUserEmails: [],
      allowedDomains: [],
      createdAt: now,
      updatedAt: now,
    } satisfies StoredCredentialDocument);
    transaction.create(db.collection(COLLECTIONS.credentialSecrets).doc(credentialRef.id), {
      ownerUid: actor.uid,
      ciphertext: encryptedSecret.ciphertext,
      wrappedDek: encryptedSecret.wrappedDek,
      kmsKeyName: encryptedSecret.kmsKeyName,
      createdAt: now,
      updatedAt: now,
    });
  });

  writeAuditLog({
    actorUid: actor.uid,
    actorEmail: actor.email,
    credentialId: credentialRef.id,
    credentialOwnerUid: actor.uid,
    eventType: "credential_created",
    result: "success",
  });

  response.status(201).json({
    credentialId: credentialRef.id,
    provider,
    label,
    status: "active",
  });
}

async function handleDisableCredential(request: Request, response: JsonResponse, credentialId: string) {
  const actor = await requireAuthenticatedUser(request);
  const { ref, data } = await requireOwnedCredential(credentialId, actor.uid);
  const updatedAt = nowTimestamp();
  await ref.update({
    status: "disabled",
    disabledAt: updatedAt,
    updatedAt,
  });

  writeAuditLog({
    actorUid: actor.uid,
    actorEmail: actor.email,
    credentialId,
    credentialOwnerUid: actor.uid,
    eventType: "credential_disabled",
    result: "success",
  });

  response.json({
    credentialId,
    provider: data.provider,
    label: data.label,
    status: "disabled",
  });
}

async function handleCreateGrant(request: Request, response: JsonResponse, credentialId: string) {
  const actor = await requireAuthenticatedUser(request);
  const body = readJsonBody<CreateGrantRequest>(request);
  if (body.granteeType !== "user_email" && body.granteeType !== "email_domain") {
    throw new HttpError(400, "invalid_grantee_type");
  }

  const normalizedGranteeValue = normalizeGrantValue(
    body.granteeType,
    normalizedString(body.granteeValue, "grantee_value"),
  );
  const grantId = grantIdFor(credentialId, body.granteeType, normalizedGranteeValue);
  const { ref: credentialRef } = await requireOwnedCredential(credentialId, actor.uid);
  const grantRef = db.collection(COLLECTIONS.grants).doc(grantId);
  const now = nowTimestamp();

  await db.runTransaction(async (transaction) => {
    const credentialUpdate: Record<string, unknown> = {
      updatedAt: now,
    };
    if (body.granteeType === "user_email") {
      credentialUpdate.allowedUserEmails = FieldValue.arrayUnion(normalizedGranteeValue);
    } else {
      credentialUpdate.allowedDomains = FieldValue.arrayUnion(normalizedGranteeValue);
    }

    transaction.set(grantRef, {
      credentialId,
      ownerUid: actor.uid,
      granteeType: body.granteeType,
      granteeValue: normalizedGranteeValue,
      createdAt: now,
    } satisfies StoredGrantDocument);
    transaction.update(credentialRef, credentialUpdate);
  });

  writeAuditLog({
    actorUid: actor.uid,
    actorEmail: actor.email,
    credentialId,
    credentialOwnerUid: actor.uid,
    eventType: "grant_created",
    result: "success",
  });

  response.status(201).json({
    grantId,
    credentialId,
    granteeType: body.granteeType,
    granteeValue: normalizedGranteeValue,
  });
}

async function handleRevokeGrant(request: Request, response: JsonResponse, grantId: string) {
  const actor = await requireAuthenticatedUser(request);
  const grantRef = db.collection(COLLECTIONS.grants).doc(grantId);
  const grantSnapshot = await grantRef.get();
  if (!grantSnapshot.exists) {
    throw new HttpError(404, "grant_not_found");
  }

  const grant = grantSnapshot.data() as StoredGrantDocument;
  if (grant.ownerUid !== actor.uid) {
    throw new HttpError(403, "grant_owner_required");
  }

  const credentialRef = db.collection(COLLECTIONS.credentials).doc(grant.credentialId);
  await db.runTransaction(async (transaction) => {
    const credentialUpdate: Record<string, unknown> = {
      updatedAt: nowTimestamp(),
    };
    if (grant.granteeType === "user_email") {
      credentialUpdate.allowedUserEmails = FieldValue.arrayRemove(grant.granteeValue);
    } else {
      credentialUpdate.allowedDomains = FieldValue.arrayRemove(grant.granteeValue);
    }

    transaction.delete(grantRef);
    transaction.update(credentialRef, credentialUpdate);
  });

  writeAuditLog({
    actorUid: actor.uid,
    actorEmail: actor.email,
    credentialId: grant.credentialId,
    credentialOwnerUid: actor.uid,
    eventType: "grant_revoked",
    result: "success",
  });

  response.json({
    grantId,
    status: "revoked",
  });
}

async function handleAuthorizeDeviceFlow(request: Request, response: JsonResponse) {
  const actor = await requireAuthenticatedUser(request);
  const body = readJsonBody<{
    user_code: string;
    credential_id: string;
  }>(request);
  const userCode = normalizedString(body.user_code, "user_code");
  const credentialId = normalizedString(body.credential_id, "credential_id");

  const deviceFlowRef = db.collection(COLLECTIONS.deviceFlows).doc(userCode);
  const deviceFlowSnapshot = await deviceFlowRef.get();
  if (!deviceFlowSnapshot.exists) {
    throw new HttpError(404, "device_flow_not_found");
  }

  const deviceFlow = deviceFlowSnapshot.data() as StoredDeviceFlowDocument;
  if (deviceFlow.expiresAt.toMillis() <= Date.now()) {
    await deviceFlowRef.update({ status: "expired" });
    throw new HttpError(410, "device_flow_expired");
  }

  if (deviceFlow.status !== "pending") {
    throw new HttpError(409, "device_flow_not_pending");
  }

  const credentialSnapshot = await db.collection(COLLECTIONS.credentials).doc(credentialId).get();
  if (!credentialSnapshot.exists) {
    throw new HttpError(404, "credential_not_found");
  }

  const credential = credentialSnapshot.data() as StoredCredentialDocument;
  if (!canUserUseCredential(credential, actor)) {
    throw new HttpError(403, "credential_not_allowed");
  }

  const authorizedAt = nowTimestamp();
  await deviceFlowRef.update({
    status: "authorized",
    credentialId,
    credentialOwnerUid: credential.ownerUid,
    actorUid: actor.uid,
    actorEmail: actor.email,
    authorizedAt,
  });

  writeAuditLog({
    actorUid: actor.uid,
    actorEmail: actor.email,
    credentialId,
    credentialOwnerUid: credential.ownerUid,
    eventType: "device_flow_authorized",
    result: "success",
  });

  response.json({
    userCode,
    credentialId,
    status: "authorized",
  });
}

async function handleChatCompletions(
  request: Request,
  response: JsonResponse & {
    setHeader(name: string, value: string): void;
    send(body: string): void;
    end(body?: string): void;
    write(chunk: Uint8Array | string): void;
  },
) {
  const issuance = await loadGatewayTokenIssuance(request);
  const { credential, secret } = await loadCredentialForIssuance(issuance);
  const apiKey = await decryptProviderSecret(secret);
  const upstream = await forwardToProvider({
    provider: credential.provider,
    endpoint: "chat_completions",
    apiKey,
    body: request.rawBody,
    contentType: request.header("content-type") ?? "application/json",
  });

  writeAuditLog({
    actorUid: issuance.actorUid,
    actorEmail: issuance.actorEmail,
    credentialId: issuance.credentialId,
    credentialOwnerUid: issuance.credentialOwnerUid,
    eventType: "chat_completions_requested",
    result: "success",
  });

  await proxyUpstreamResponse(upstream, response);
}

async function handleResponses(
  request: Request,
  response: JsonResponse & {
    setHeader(name: string, value: string): void;
    send(body: string): void;
    end(body?: string): void;
    write(chunk: Uint8Array | string): void;
  },
) {
  const issuance = await loadGatewayTokenIssuance(request);
  const { credential, secret } = await loadCredentialForIssuance(issuance);
  const apiKey = await decryptProviderSecret(secret);
  const upstream = await forwardToProvider({
    provider: credential.provider,
    endpoint: "responses",
    apiKey,
    body: request.rawBody,
    contentType: request.header("content-type") ?? "application/json",
  });

  writeAuditLog({
    actorUid: issuance.actorUid,
    actorEmail: issuance.actorEmail,
    credentialId: issuance.credentialId,
    credentialOwnerUid: issuance.credentialOwnerUid,
    eventType: "responses_requested",
    result: "success",
  });

  await proxyUpstreamResponse(upstream, response);
}

export const api = onRequest({ cors: true, region }, async (request, response) => {
  await withHttpErrors(response, async () => {
    const path = requestPath(request);

    if (request.method === "POST" && path === "/api/device-flows") {
      await handleStartDeviceFlow(request, response);
      return;
    }

    const deviceFlowPollMatch = path.match(/^\/api\/device-flows\/([^/]+)\/poll$/);
    if (request.method === "POST" && deviceFlowPollMatch !== null) {
      await handlePollDeviceFlow(response, decodeURIComponent(deviceFlowPollMatch[1]));
      return;
    }

    if (request.method === "POST" && path === "/api/device-authorizations") {
      await handleAuthorizeDeviceFlow(request, response);
      return;
    }

    if (request.method === "POST" && path === "/api/credentials") {
      await handleCreateCredential(request, response);
      return;
    }

    const disableCredentialMatch = path.match(/^\/api\/credentials\/([^/]+)\/disable$/);
    if (request.method === "POST" && disableCredentialMatch !== null) {
      await handleDisableCredential(request, response, decodeURIComponent(disableCredentialMatch[1]));
      return;
    }

    const createGrantMatch = path.match(/^\/api\/credentials\/([^/]+)\/grants$/);
    if (request.method === "POST" && createGrantMatch !== null) {
      await handleCreateGrant(request, response, decodeURIComponent(createGrantMatch[1]));
      return;
    }

    const revokeGrantMatch = path.match(/^\/api\/grants\/([^/]+)\/revoke$/);
    if (request.method === "POST" && revokeGrantMatch !== null) {
      await handleRevokeGrant(request, response, decodeURIComponent(revokeGrantMatch[1]));
      return;
    }

    throw new HttpError(404, "route_not_found");
  });
});

export const gatewayApi = onRequest({ cors: true, region }, async (request, response) => {
  await withHttpErrors(response, async () => {
    const path = requestPath(request);

    if (request.method === "POST" && path === "/v1/chat/completions") {
      await handleChatCompletions(request, response);
      return;
    }

    if (request.method === "POST" && path === "/v1/responses") {
      await handleResponses(request, response);
      return;
    }

    throw new HttpError(404, "route_not_found");
  });
});
