#!/usr/bin/env node

function usage() {
  console.error("Usage: node scripts/device-flow-client.mjs <base-url>");
  console.error("Example: node scripts/device-flow-client.mjs https://enki-gate.web.app");
}

function normalizeBaseUrl(value) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("Base URL is required.");
  }

  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function sleep(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function startDeviceFlow(baseUrl) {
  const response = await fetch(`${baseUrl}/api/device-flows`, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Device flow start failed with status ${response.status}.`);
  }

  return response.json();
}

async function pollDeviceFlow(baseUrl, deviceCode) {
  const response = await fetch(`${baseUrl}/api/device-flows/${encodeURIComponent(deviceCode)}/poll`, {
    method: "POST",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Device flow poll failed with status ${response.status}: ${body}`);
  }

  return response.json();
}

async function main() {
  const baseUrl = normalizeBaseUrl(process.argv[2] ?? "");
  const started = await startDeviceFlow(baseUrl);

  console.log("Device flow started.");
  console.log(`verification_uri: ${started.verification_uri}`);
  console.log(`user_code:        ${started.user_code}`);
  console.log(`device_code:      ${started.device_code}`);
  console.log(`expires_in:       ${started.expires_in}`);
  console.log(`interval:         ${started.interval}`);
  console.log("");
  console.log("Open the verification URI in a browser, sign in, and authorize the flow.");
  console.log("Polling for gateway token...");

  while (true) {
    await sleep(started.interval * 1000);
    const polled = await pollDeviceFlow(baseUrl, started.device_code);

    if (polled.status === "pending") {
      console.log("pending");
      continue;
    }

    if (polled.status === "completed") {
      console.log("completed");
      console.log(JSON.stringify(polled, null, 2));
      return;
    }

    throw new Error(`Unexpected device flow status: ${JSON.stringify(polled)}`);
  }
}

try {
  if (process.argv.length !== 3) {
    usage();
    process.exit(1);
  }

  await main();
} catch (error) {
  console.error(error);
  process.exit(1);
}
