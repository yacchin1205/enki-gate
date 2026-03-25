import type { ResourceStatus } from "@enki-gate/domain";

export function statusLabel(status: ResourceStatus) {
  switch (status) {
    case "active":
      return "有効";
    case "disabled":
      return "無効";
  }
}
