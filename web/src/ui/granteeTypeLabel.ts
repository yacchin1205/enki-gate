import type { GrantGranteeType } from "@enki-gate/domain";
import type { IntlShape } from "react-intl";

export function granteeTypeLabel(intl: IntlShape, granteeType: GrantGranteeType) {
  switch (granteeType) {
    case "user_email":
      return intl.formatMessage({ id: "granteeType.user_email" });
    case "email_domain":
      return intl.formatMessage({ id: "granteeType.email_domain" });
  }
}
