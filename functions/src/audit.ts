import { logger } from "firebase-functions";

type AuditPayload = {
  actorUid?: string;
  actorEmail?: string;
  credentialId?: string;
  credentialOwnerUid?: string;
  eventType: string;
  result: "success" | "failure";
  [key: string]: unknown;
};

export function writeAuditLog(payload: AuditPayload) {
  logger.info("audit", {
    audit: true,
    ...payload,
    timestamp: new Date().toISOString(),
  });
}
