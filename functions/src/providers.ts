import { HttpError } from "./http.js";
import type { CredentialProvider } from "./domain.js";

async function validateOpenAiApiKey(apiKey: string) {
  const response = await fetch("https://api.openai.com/v1/models", {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    throw new HttpError(400, "invalid_openai_api_key");
  }
}

async function validateAnthropicApiKey(apiKey: string) {
  const response = await fetch("https://api.anthropic.com/v1/models", {
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
  });

  if (!response.ok) {
    throw new HttpError(400, "invalid_anthropic_api_key");
  }
}

export async function validateProviderApiKey(provider: CredentialProvider, apiKey: string) {
  if (provider === "openai") {
    await validateOpenAiApiKey(apiKey);
    return;
  }

  if (provider === "anthropic") {
    await validateAnthropicApiKey(apiKey);
    return;
  }

  throw new HttpError(400, "unsupported_provider");
}

type UpstreamEndpoint = "chat_completions" | "responses";

function upstreamUrl(provider: CredentialProvider, endpoint: UpstreamEndpoint) {
  if (provider === "openai") {
    if (endpoint === "chat_completions") {
      return "https://api.openai.com/v1/chat/completions";
    }

    return "https://api.openai.com/v1/responses";
  }

  if (provider === "anthropic") {
    if (endpoint === "chat_completions") {
      return "https://api.anthropic.com/v1/chat/completions";
    }

    throw new HttpError(501, "unsupported_provider_endpoint");
  }

  throw new HttpError(400, "unsupported_provider");
}

export async function forwardToProvider(input: {
  provider: CredentialProvider;
  endpoint: UpstreamEndpoint;
  apiKey: string;
  body: Buffer;
  contentType: string;
}) {
  return fetch(upstreamUrl(input.provider, input.endpoint), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "content-type": input.contentType,
    },
    body: new Uint8Array(input.body),
  });
}
