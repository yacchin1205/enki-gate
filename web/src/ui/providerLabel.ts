import type { CredentialProvider } from "@enki-gate/domain";

export function providerLabel(provider: CredentialProvider) {
  switch (provider) {
    case "openai":
      return "OpenAI";
    case "anthropic":
      return "Anthropic";
  }
}
