import type { CredentialProvider } from "@enki-gate/domain";
import type { IntlShape } from "react-intl";

export function providerLabel(intl: IntlShape, provider: CredentialProvider) {
  switch (provider) {
    case "openai":
      return intl.formatMessage({ id: "provider.openai" });
    case "anthropic":
      return intl.formatMessage({ id: "provider.anthropic" });
  }
}
