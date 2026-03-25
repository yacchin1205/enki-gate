import type { GrantStatus } from "@enki-gate/domain";
import type { IntlShape } from "react-intl";

export function grantStatusLabel(intl: IntlShape, status: GrantStatus) {
  switch (status) {
    case "active":
      return intl.formatMessage({ id: "grantStatus.active" });
    case "revoked":
      return intl.formatMessage({ id: "grantStatus.revoked" });
  }
}
