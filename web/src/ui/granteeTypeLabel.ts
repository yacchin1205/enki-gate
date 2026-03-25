import type { GrantGranteeType } from "@enki-gate/domain";

export function granteeTypeLabel(granteeType: GrantGranteeType) {
  switch (granteeType) {
    case "user_email":
      return "個人メールアドレス";
    case "email_domain":
      return "メールドメイン";
  }
}
