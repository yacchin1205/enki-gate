import React from "react";
import ReactDOM from "react-dom/client";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { Navigate } from "react-router-dom";
import { AuthProvider } from "./auth/AuthProvider";
import { I18nProvider } from "./i18n/I18nProvider";
import { RequireAuth } from "./auth/RequireAuth";
import { AppLayout } from "./ui/AppLayout";
import { FlowLayout } from "./ui/FlowLayout";
import { CredentialsPage } from "./ui/pages/CredentialsPage";
import { DeviceFlowCompletePage } from "./ui/pages/DeviceFlowCompletePage";
import { DeviceFlowPage } from "./ui/pages/DeviceFlowPage";
import { GrantCreatePage } from "./ui/pages/GrantCreatePage";
import { NewCredentialPage } from "./ui/pages/NewCredentialPage";
import { LogoutPage } from "./ui/pages/LogoutPage";
import { SignInPage } from "./ui/pages/SignInPage";
import { CredentialDetailPage } from "./ui/pages/CredentialDetailPage";
import "./styles.css";

const theme = createTheme({
  palette: {
    background: {
      default: "#f7f8fa",
      paper: "#ffffff",
    },
  },
  shape: {
    borderRadius: 10,
  },
  typography: {
    fontFamily: '"IBM Plex Sans JP", "Hiragino Sans", sans-serif',
    h4: {
      fontSize: "1.8rem",
      fontWeight: 700,
    },
    h5: {
      fontWeight: 700,
    },
    h6: {
      fontWeight: 700,
    },
  },
});

const router = createBrowserRouter([
  {
    element: <FlowLayout />,
    children: [
      { path: "sign-in", element: <SignInPage /> },
      { path: "logout", element: <LogoutPage /> },
      { path: "device", element: <DeviceFlowPage /> },
      { path: "device/complete", element: <DeviceFlowCompletePage /> },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        path: "/",
        element: <AppLayout />,
        children: [
          { index: true, element: <Navigate replace to="/credentials" /> },
          { path: "credentials", element: <CredentialsPage /> },
          { path: "credentials/new", element: <NewCredentialPage /> },
          { path: "credentials/:credentialId", element: <CredentialDetailPage /> },
          { path: "credentials/:credentialId/grants/new", element: <GrantCreatePage /> },
        ],
      },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <I18nProvider>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </I18nProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
