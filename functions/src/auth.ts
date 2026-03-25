import { getAuth } from "firebase-admin/auth";
import type { Request } from "firebase-functions/v2/https";
import { HttpError } from "./http.js";

export type AuthenticatedUser = {
  uid: string;
  email: string;
  domain: string;
};

function readBearerToken(request: Request) {
  const authorization = request.header("authorization");
  if (authorization === undefined || !authorization.startsWith("Bearer ")) {
    console.warn("Authentication failed: missing bearer token.", {
      method: request.method,
      path: request.path,
    });
    throw new HttpError(401, "unauthorized");
  }

  return authorization.slice("Bearer ".length);
}

export async function requireAuthenticatedUser(request: Request): Promise<AuthenticatedUser> {
  let decoded;
  try {
    decoded = await getAuth().verifyIdToken(readBearerToken(request));
  } catch (error) {
    console.error("Authentication failed: verifyIdToken.", {
      method: request.method,
      path: request.path,
    }, error);
    throw new HttpError(401, "unauthorized");
  }

  if (decoded.email === undefined || decoded.email_verified !== true) {
    console.warn("Authentication failed: email verification required.", {
      method: request.method,
      path: request.path,
      uid: decoded.uid,
    });
    throw new HttpError(403, "forbidden");
  }

  return {
    uid: decoded.uid,
    email: decoded.email,
    domain: decoded.email.split("@")[1],
  };
}

export function readGatewayBearerToken(request: Request) {
  return readBearerToken(request);
}
