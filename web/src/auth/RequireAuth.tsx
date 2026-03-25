import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useIntl } from "react-intl";
import { useAuth } from "./AuthProvider";
import { FormNotice } from "../ui/components/FormNotice";

export function RequireAuth() {
  const { ready, user, error } = useAuth();
  const location = useLocation();
  const intl = useIntl();

  if (!ready) {
    return <div className="panel">{intl.formatMessage({ id: "common.loadingAuthState" })}</div>;
  }

  if (error !== null) {
    return <FormNotice message={error} tone="error" />;
  }

  if (user === null) {
    return <Navigate replace state={{ from: location.pathname }} to="/sign-in" />;
  }

  return <Outlet />;
}
