import type { ResourceStatus } from "@enki-gate/domain";
import type { IntlShape } from "react-intl";

export function statusLabel(intl: IntlShape, status: ResourceStatus) {
  switch (status) {
    case "active":
      return intl.formatMessage({ id: "status.active" });
    case "disabled":
      return intl.formatMessage({ id: "status.disabled" });
  }
}
