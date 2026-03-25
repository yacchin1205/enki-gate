#!/usr/bin/env node

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { readFile } from "node:fs/promises";

function usage() {
  console.error("Usage: node scripts/set-email-verified.mjs <service-account-json> <email>");
}

async function main() {
  const serviceAccountPath = process.argv[2];
  const email = process.argv[3];

  if (serviceAccountPath === undefined || email === undefined) {
    usage();
    process.exit(1);
  }

  const serviceAccount = JSON.parse(await readFile(serviceAccountPath, "utf8"));
  if (getApps().length === 0) {
    initializeApp({
      credential: cert(serviceAccount),
    });
  }

  const auth = getAuth();
  const user = await auth.getUserByEmail(email);
  await auth.updateUser(user.uid, {
    emailVerified: true,
  });

  console.log(JSON.stringify({
    uid: user.uid,
    email,
    emailVerified: true,
  }, null, 2));
}

await main();
