import crypto from "node:crypto";
import { KeyManagementServiceClient } from "@google-cloud/kms";
import { defineString } from "firebase-functions/params";
import { HttpError } from "./http.js";

const kmsKeyName = defineString("KMS_KEY_NAME");
const kmsClient = new KeyManagementServiceClient();

type EncryptedSecret = {
  ciphertext: string;
  wrappedDek: string;
  kmsKeyName: string;
};

function requiredKmsKeyName() {
  const value = kmsKeyName.value();
  if (value.length === 0) {
    throw new HttpError(500, "kms_key_name_not_configured");
  }

  return value;
}

export async function encryptProviderSecret(secret: string): Promise<EncryptedSecret> {
  const dek = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", dek, iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const keyName = requiredKmsKeyName();
  const [result] = await kmsClient.encrypt({
    name: keyName,
    plaintext: dek,
  });

  if (result.ciphertext === undefined || result.ciphertext === null) {
    throw new HttpError(500, "kms_encrypt_failed");
  }

  return {
    ciphertext: JSON.stringify({
      iv: iv.toString("base64"),
      authTag: authTag.toString("base64"),
      ciphertext: encrypted.toString("base64"),
    }),
    wrappedDek:
      typeof result.ciphertext === "string"
        ? Buffer.from(result.ciphertext, "utf8").toString("base64")
        : Buffer.from(result.ciphertext).toString("base64"),
    kmsKeyName: keyName,
  };
}

export async function decryptProviderSecret(encryptedSecret: EncryptedSecret): Promise<string> {
  const [result] = await kmsClient.decrypt({
    name: encryptedSecret.kmsKeyName,
    ciphertext: Buffer.from(encryptedSecret.wrappedDek, "base64"),
  });

  if (result.plaintext === undefined || result.plaintext === null) {
    throw new HttpError(500, "kms_decrypt_failed");
  }

  const dek =
    typeof result.plaintext === "string"
      ? Buffer.from(result.plaintext, "utf8")
      : Buffer.from(result.plaintext);
  const payload = JSON.parse(encryptedSecret.ciphertext) as {
    iv: string;
    authTag: string;
    ciphertext: string;
  };

  const decipher = crypto.createDecipheriv("aes-256-gcm", dek, Buffer.from(payload.iv, "base64"));
  decipher.setAuthTag(Buffer.from(payload.authTag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, "base64")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}
