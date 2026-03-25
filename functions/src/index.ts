import crypto from "node:crypto";
import { Readable } from "node:stream";
import { Logging } from "@google-cloud/logging";
import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, Timestamp, type Transaction } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { defineString } from "firebase-functions/params";
import { onRequest, type Request } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import {
  type AccessScopeType,
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
const logging = new Logging();
const region = "asia-northeast1";
const webAppOrigin = defineString("WEB_APP_ORIGIN");

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

function tokyoDateKey(value: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value).replace(/-/g, "");
}

function recentTokyoDateKeys(days: number) {
  const keys: string[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const value = new Date();
    value.setDate(value.getDate() - offset);
    keys.push(tokyoDateKey(value));
  }

  return keys;
}

function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function verificationUri(request: Request) {
  const origin = webAppOrigin.value();
  if (origin.length === 0) {
    throw new HttpError(500, "web_app_origin_not_configured");
  }

  return `${origin.replace(/\/+$/, "")}/device`;
}

function requestPath(request: Request) {
  return request.path.endsWith("/") && request.path !== "/" ? request.path.slice(0, -1) : request.path;
}

function requiredDeviceFlowIssuanceFields(deviceFlow: StoredDeviceFlowDocument) {
  if (
    deviceFlow.actorUid === undefined ||
    deviceFlow.actorEmail === undefined ||
    deviceFlow.credentialId === undefined ||
    deviceFlow.credentialOwnerUid === undefined ||
    deviceFlow.accessScopeType === undefined
  ) {
    throw new HttpError(500, "device_flow_missing_authorization_fields");
  }

  return {
    actorUid: deviceFlow.actorUid,
    actorEmail: deviceFlow.actorEmail,
    credentialId: deviceFlow.credentialId,
    credentialOwnerUid: deviceFlow.credentialOwnerUid,
    accessScopeType: deviceFlow.accessScopeType,
    accessScopeValue: deviceFlow.accessScopeValue,
    grantId: deviceFlow.grantId,
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

function emptyUsageSummary7d() {
  return recentTokyoDateKeys(7).map((dateKey) => ({
    dateKey,
    requestCount: 0,
  }));
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

function resolveAccessScope(
  credentialId: string,
  credential: StoredCredentialDocument,
  actor: { uid: string; email: string; domain: string },
) {
  if (credential.status !== "active") {
    throw new HttpError(403, "credential_not_allowed");
  }

  if (credential.ownerUid === actor.uid) {
    return {
      accessScopeType: "owner" as const,
    };
  }

  if (credential.allowedUserEmails.includes(actor.email)) {
    return {
      accessScopeType: "user_email" as const,
      accessScopeValue: actor.email,
      grantId: grantIdFor(credentialId, "user_email", actor.email),
    };
  }

  if (credential.allowedDomains.includes(actor.domain)) {
    return {
      accessScopeType: "email_domain" as const,
      accessScopeValue: actor.domain,
      grantId: grantIdFor(credentialId, "email_domain", actor.domain),
    };
  }

  throw new HttpError(403, "credential_not_allowed");
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
  const grantPromise =
    issuance.grantId === undefined
      ? Promise.resolve(undefined)
      : db.collection(COLLECTIONS.grants).doc(issuance.grantId).get();
  const [credentialSnapshot, secretSnapshot, grantSnapshot] = await Promise.all([
    db.collection(COLLECTIONS.credentials).doc(issuance.credentialId).get(),
    db.collection(COLLECTIONS.credentialSecrets).doc(issuance.credentialId).get(),
    grantPromise,
  ]);

  if (!credentialSnapshot.exists) {
    throw new HttpError(404, "credential_not_found");
  }

  if (!secretSnapshot.exists) {
    throw new HttpError(404, "credential_secret_not_found");
  }

  const credential = credentialSnapshot.data() as StoredCredentialDocument;
  if (credential.status !== "active") {
    throw new HttpError(403, "credential_not_allowed");
  }

  if (credential.ownerUid !== issuance.credentialOwnerUid) {
    throw new HttpError(401, "invalid_gateway_token");
  }

  if (issuance.accessScopeType === "owner") {
    return {
      credential,
      secret: secretSnapshot.data() as StoredCredentialSecretDocument,
    };
  }

  if (issuance.grantId === undefined || issuance.accessScopeValue === undefined) {
    throw new HttpError(401, "invalid_gateway_token");
  }

  if (grantSnapshot === undefined || !grantSnapshot.exists) {
    throw new HttpError(403, "credential_not_allowed");
  }

  const grant = grantSnapshot.data() as Partial<StoredGrantDocument>;
  if (grant.status !== "active") {
    throw new HttpError(403, "credential_not_allowed");
  }
  if (
    typeof grant.credentialId !== "string" ||
    typeof grant.ownerUid !== "string" ||
    typeof grant.granteeType !== "string" ||
    typeof grant.granteeValue !== "string"
  ) {
    throw new Error("grant is missing required fields");
  }

  if (grant.credentialId !== issuance.credentialId || grant.ownerUid !== credential.ownerUid) {
    throw new HttpError(401, "invalid_gateway_token");
  }

  if (
    (issuance.accessScopeType === "user_email" && grant.granteeType !== "user_email") ||
    (issuance.accessScopeType === "email_domain" && grant.granteeType !== "email_domain")
  ) {
    throw new HttpError(401, "invalid_gateway_token");
  }

  if (grant.granteeValue !== issuance.accessScopeValue) {
    throw new HttpError(401, "invalid_gateway_token");
  }

  return {
    credential,
    secret: secretSnapshot.data() as StoredCredentialSecretDocument,
  };
}

async function recordGrantLastAccess(issuance: StoredTokenIssuanceDocument) {
  if (issuance.grantId === undefined) {
    return;
  }

  await db.collection(COLLECTIONS.grants).doc(issuance.grantId).update({
    lastAccessAt: nowTimestamp(),
  });
}

type AuditUsageEvent = {
  grantId: string;
  timestamp: Date;
};

function auditUsageEventFromEntry(entry: any): AuditUsageEvent {
  const payload = entry.data;
  if (typeof payload !== "object" || payload === null) {
    throw new Error("refreshGrantUsageSummaries: payload missing from audit entry");
  }

  if (payload.audit !== true) {
    throw new Error("refreshGrantUsageSummaries: audit flag missing from audit entry");
  }

  if (payload.result !== "success") {
    throw new Error("refreshGrantUsageSummaries: result missing from audit entry");
  }

  if (payload.eventType !== "chat_completions_requested" && payload.eventType !== "responses_requested") {
    throw new Error("refreshGrantUsageSummaries: eventType missing from audit entry");
  }

  if (typeof payload.grantId !== "string" || payload.grantId.length === 0) {
    throw new Error("refreshGrantUsageSummaries: grantId missing from audit entry");
  }

  if (typeof payload.timestamp !== "string" || payload.timestamp.length === 0) {
    throw new Error("refreshGrantUsageSummaries: timestamp missing from audit entry");
  }

  const timestamp = new Date(payload.timestamp);
  if (Number.isNaN(timestamp.getTime())) {
    throw new Error("refreshGrantUsageSummaries: timestamp invalid in audit entry");
  }

  return {
    grantId: payload.grantId,
    timestamp,
  };
}

function sevenDayUsageSummary(events: AuditUsageEvent[]) {
  const dateKeys = recentTokyoDateKeys(7);
  const counts = new Map<string, number>();
  for (const event of events) {
    const dateKey = tokyoDateKey(event.timestamp);
    counts.set(dateKey, (counts.get(dateKey) ?? 0) + 1);
  }

  return dateKeys.map((dateKey) => ({
    dateKey,
    requestCount: counts.get(dateKey) ?? 0,
  }));
}

async function updateGrantUsageSummaryBatch(
  refs: FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>[],
  updatedAt: Timestamp,
  eventsByGrant: Map<string, AuditUsageEvent[]>,
) {
  if (refs.length === 0) {
    return;
  }

  const batch = db.batch();
  for (const ref of refs) {
    batch.update(ref, {
      usageSummary7d: sevenDayUsageSummary(eventsByGrant.get(ref.id) ?? []),
      usageUpdatedAt: updatedAt,
    });
  }

  await batch.commit();
}

async function rebuildGrantUsageSummaryCache() {
  const since = new Date();
  since.setDate(since.getDate() - 6);
  since.setHours(0, 0, 0, 0);

  const filter = [
    `timestamp >= "${since.toISOString()}"`,
    "jsonPayload.audit = true",
    'jsonPayload.result = "success"',
    '(jsonPayload.eventType = "chat_completions_requested" OR jsonPayload.eventType = "responses_requested")',
  ].join(" AND ");

  const [entries] = await logging.getEntries({
    filter,
    pageSize: 1000,
    orderBy: "timestamp desc",
  });
  logger.info("refreshGrantUsageSummaries: loaded logging entries", {
    filter,
    entryCount: entries.length,
  });

  const eventsByGrant = new Map<string, AuditUsageEvent[]>();
  const parseWarnings: Array<{
    message: string;
    payload: unknown;
  }> = [];
  for (const entry of entries) {
    let event: AuditUsageEvent;
    try {
      event = auditUsageEventFromEntry(entry);
    } catch (caught) {
      parseWarnings.push({
        message: (caught as Error).message,
        payload: entry.data,
      });
      continue;
    }
    const existing = eventsByGrant.get(event.grantId) ?? [];
    existing.push(event);
    eventsByGrant.set(event.grantId, existing);
  }
  if (parseWarnings.length > 0) {
    logger.warn("refreshGrantUsageSummaries: skipped audit entries", {
      skippedEntryCount: parseWarnings.length,
      warnings: parseWarnings,
    });
  }
  logger.info("refreshGrantUsageSummaries: grouped events by grant", {
    grantCount: eventsByGrant.size,
    grants: Array.from(eventsByGrant.entries()).map(([grantId, events]) => ({
      grantId,
      eventCount: events.length,
      dates: sevenDayUsageSummary(events),
    })),
  });

  const grantsSnapshot = await db.collection(COLLECTIONS.grants).get();
  const updatedAt = nowTimestamp();
  logger.info("refreshGrantUsageSummaries: loaded grants", {
    grantDocumentCount: grantsSnapshot.size,
    grantIds: grantsSnapshot.docs.map((snapshot) => snapshot.id),
  });
  let refs: FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>[] = [];
  for (const snapshot of grantsSnapshot.docs) {
    refs.push(snapshot.ref);
    if (refs.length === 400) {
      await updateGrantUsageSummaryBatch(refs, updatedAt, eventsByGrant);
      refs = [];
    }
  }

  await updateGrantUsageSummaryBatch(refs, updatedAt, eventsByGrant);
  logger.info("refreshGrantUsageSummaries: updated grants", {
    updatedGrantCount: grantsSnapshot.size,
    updatedAt: updatedAt.toDate().toISOString(),
  });
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

async function handleGetDeviceFlowStatus(response: JsonResponse, userCode: string) {
  const snapshot = await db.collection(COLLECTIONS.deviceFlows).doc(userCode).get();
  if (!snapshot.exists) {
    throw new HttpError(404, "device_flow_not_found");
  }

  const deviceFlow = snapshot.data() as StoredDeviceFlowDocument;
  if (deviceFlow.expiresAt.toMillis() <= Date.now()) {
    response.json({ status: "expired" });
    return;
  }

  response.json({ status: deviceFlow.status });
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
  const issuanceDocument: Record<string, unknown> = {
    actorUid: issuanceFields.actorUid,
    actorEmail: issuanceFields.actorEmail,
    credentialId: issuanceFields.credentialId,
    credentialOwnerUid: issuanceFields.credentialOwnerUid,
    accessScopeType: issuanceFields.accessScopeType,
    tokenHash,
    issuedAt,
    expiresAt,
  };
  if (issuanceFields.accessScopeValue !== undefined) {
    issuanceDocument.accessScopeValue = issuanceFields.accessScopeValue;
  }
  if (issuanceFields.grantId !== undefined) {
    issuanceDocument.grantId = issuanceFields.grantId;
  }

  await db.runTransaction(async (transaction) => {
    transaction.create(issuanceRef, issuanceDocument as StoredTokenIssuanceDocument);
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
    accessScopeType: issuanceFields.accessScopeType,
    accessScopeValue: issuanceFields.accessScopeValue,
    grantId: issuanceFields.grantId,
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
  if (data.status === "disabled") {
    throw new HttpError(409, "credential_already_disabled");
  }

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

async function handleEnableCredential(request: Request, response: JsonResponse, credentialId: string) {
  const actor = await requireAuthenticatedUser(request);
  const { ref, data } = await requireOwnedCredential(credentialId, actor.uid);
  if (data.status === "active") {
    throw new HttpError(409, "credential_already_active");
  }

  const updatedAt = nowTimestamp();
  await ref.update({
    status: "active",
    disabledAt: FieldValue.delete(),
    updatedAt,
  });

  writeAuditLog({
    actorUid: actor.uid,
    actorEmail: actor.email,
    credentialId,
    credentialOwnerUid: actor.uid,
    eventType: "credential_enabled",
    result: "success",
  });

  response.json({
    credentialId,
    provider: data.provider,
    label: data.label,
    status: "active",
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
  let outcome: "created" | "reactivated" = "created";

  await db.runTransaction(async (transaction) => {
    const grantSnapshot = await transaction.get(grantRef);
    if (grantSnapshot.exists) {
      const existingGrant = grantSnapshot.data() as Partial<StoredGrantDocument>;
      if (existingGrant.status === "active") {
        throw new HttpError(409, "grant_already_exists");
      }
      if (existingGrant.status !== "revoked") {
        throw new Error("grant status must be active or revoked");
      }

      outcome = "reactivated";
    }

    const credentialUpdate: Record<string, unknown> = {
      updatedAt: now,
    };
    if (body.granteeType === "user_email") {
      credentialUpdate.allowedUserEmails = FieldValue.arrayUnion(normalizedGranteeValue);
    } else {
      credentialUpdate.allowedDomains = FieldValue.arrayUnion(normalizedGranteeValue);
    }

    if (outcome === "created") {
      transaction.create(grantRef, {
        credentialId,
        ownerUid: actor.uid,
        granteeType: body.granteeType,
        granteeValue: normalizedGranteeValue,
        status: "active",
        createdAt: now,
        updatedAt: now,
        usageSummary7d: emptyUsageSummary7d(),
      } satisfies StoredGrantDocument);
    } else {
      transaction.update(grantRef, {
        status: "active",
        updatedAt: now,
        revokedAt: FieldValue.delete(),
      });
    }

    transaction.update(credentialRef, credentialUpdate);
  });

  writeAuditLog({
    actorUid: actor.uid,
    actorEmail: actor.email,
    credentialId,
    credentialOwnerUid: actor.uid,
    eventType: outcome === "created" ? "grant_created" : "grant_reactivated",
    result: "success",
  });

  response.status(outcome === "created" ? 201 : 200).json({
    grantId,
    credentialId,
    granteeType: body.granteeType,
    granteeValue: normalizedGranteeValue,
    status: "active",
  });
}

async function handleRevokeGrant(request: Request, response: JsonResponse, grantId: string) {
  const actor = await requireAuthenticatedUser(request);
  const grantRef = db.collection(COLLECTIONS.grants).doc(grantId);
  const grantSnapshot = await grantRef.get();
  if (!grantSnapshot.exists) {
    throw new HttpError(404, "grant_not_found");
  }

  const grant = grantSnapshot.data() as Partial<StoredGrantDocument>;
  if (grant.ownerUid !== actor.uid) {
    throw new HttpError(403, "grant_owner_required");
  }

  if (grant.status === "revoked") {
    throw new HttpError(409, "grant_already_revoked");
  }
  if (grant.status !== "active") {
    throw new Error("grant status must be active or revoked");
  }
  if (
    typeof grant.credentialId !== "string" ||
    (grant.granteeType !== "user_email" && grant.granteeType !== "email_domain") ||
    typeof grant.granteeValue !== "string"
  ) {
    throw new Error("grant is missing required fields");
  }

  const credentialRef = db.collection(COLLECTIONS.credentials).doc(grant.credentialId);
  const revokedAt = nowTimestamp();
  await db.runTransaction(async (transaction) => {
    const credentialUpdate: Record<string, unknown> = {
      updatedAt: revokedAt,
    };
    if (grant.granteeType === "user_email") {
      credentialUpdate.allowedUserEmails = FieldValue.arrayRemove(grant.granteeValue);
    } else {
      credentialUpdate.allowedDomains = FieldValue.arrayRemove(grant.granteeValue);
    }

    transaction.update(grantRef, {
      status: "revoked",
      updatedAt: revokedAt,
      revokedAt,
    });
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
  const accessScope = resolveAccessScope(credentialId, credential, actor);

  const authorizedAt = nowTimestamp();
  const authorizedDeviceFlowUpdate: Record<string, unknown> = {
    status: "authorized",
    credentialId,
    credentialOwnerUid: credential.ownerUid,
    actorUid: actor.uid,
    actorEmail: actor.email,
    accessScopeType: accessScope.accessScopeType,
    authorizedAt,
  };
  if (accessScope.accessScopeValue !== undefined) {
    authorizedDeviceFlowUpdate.accessScopeValue = accessScope.accessScopeValue;
  }
  if (accessScope.grantId !== undefined) {
    authorizedDeviceFlowUpdate.grantId = accessScope.grantId;
  }

  await deviceFlowRef.update(authorizedDeviceFlowUpdate);

  writeAuditLog({
    actorUid: actor.uid,
    actorEmail: actor.email,
    credentialId,
    credentialOwnerUid: credential.ownerUid,
    accessScopeType: accessScope.accessScopeType,
    accessScopeValue: accessScope.accessScopeValue,
    grantId: accessScope.grantId,
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
  if (upstream.ok) {
    await recordGrantLastAccess(issuance);
  }

  writeAuditLog({
    actorUid: issuance.actorUid,
    actorEmail: issuance.actorEmail,
    credentialId: issuance.credentialId,
    credentialOwnerUid: issuance.credentialOwnerUid,
    accessScopeType: issuance.accessScopeType,
    accessScopeValue: issuance.accessScopeValue,
    grantId: issuance.grantId,
    eventType: "chat_completions_requested",
    result: upstream.ok ? "success" : "failure",
    upstreamStatus: upstream.status,
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
  if (upstream.ok) {
    await recordGrantLastAccess(issuance);
  }

  writeAuditLog({
    actorUid: issuance.actorUid,
    actorEmail: issuance.actorEmail,
    credentialId: issuance.credentialId,
    credentialOwnerUid: issuance.credentialOwnerUid,
    accessScopeType: issuance.accessScopeType,
    accessScopeValue: issuance.accessScopeValue,
    grantId: issuance.grantId,
    eventType: "responses_requested",
    result: upstream.ok ? "success" : "failure",
    upstreamStatus: upstream.status,
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

    const deviceFlowStatusMatch = path.match(/^\/api\/device-flows\/([^/]+)\/status$/);
    if (request.method === "GET" && deviceFlowStatusMatch !== null) {
      await handleGetDeviceFlowStatus(response, decodeURIComponent(deviceFlowStatusMatch[1]));
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

    const enableCredentialMatch = path.match(/^\/api\/credentials\/([^/]+)\/enable$/);
    if (request.method === "POST" && enableCredentialMatch !== null) {
      await handleEnableCredential(request, response, decodeURIComponent(enableCredentialMatch[1]));
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

export const refreshGrantUsageSummaries = onSchedule(
  {
    schedule: "every 15 minutes",
    region,
    timeZone: "Asia/Tokyo",
  },
  async () => {
    await rebuildGrantUsageSummaryCache();
  },
);
