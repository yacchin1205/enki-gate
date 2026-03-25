import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import { FormNotice } from "../ui/components/FormNotice";

export function RequireAuth() {
  const { ready, user, error } = useAuth();
  const location = useLocation();

  if (!ready) {
    return <div className="panel">認証状態を確認しています。</div>;
  }

  if (error !== null) {
    return <FormNotice message={error} tone="error" />;
  }

  if (user === null) {
    return <Navigate replace state={{ from: location.pathname }} to="/sign-in" />;
  }

  return <Outlet />;
}
