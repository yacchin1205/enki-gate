import GoogleIcon from "@mui/icons-material/Google";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import {
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
} from "firebase/auth";
import { useEffect, useState, type FormEvent } from "react";
import { useIntl } from "react-intl";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { auth } from "../../lib/firebase";
import { FormNotice } from "../components/FormNotice";

export function SignInPage() {
  const { ready, user, error: authError } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const intl = useIntl();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordAuthEnabled = import.meta.env.DEV;

  useEffect(() => {
    if (!ready || user === null) {
      return;
    }

    const target = typeof location.state?.from === "string" ? location.state.from : "/";
    navigate(target, { replace: true });
  }, [location.state, navigate, ready, user]);

  async function handleEmailPasswordSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));

    setSubmitting(true);
    setError(null);

    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (caught: unknown) {
      setError((caught as Error).message);
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
  }

  return (
    <Paper sx={{ p: 4 }} variant="outlined">
      <Stack spacing={3}>
        <Typography variant="h5">{intl.formatMessage({ id: "signIn.title" })}</Typography>
        <Typography color="text.secondary">{intl.formatMessage({ id: "common.serviceDescription" })}</Typography>
        <Typography color="text.secondary">{intl.formatMessage({ id: "signIn.description" })}</Typography>
        {authError !== null ? <FormNotice message={authError} tone="error" /> : null}
        {error !== null ? <FormNotice message={error} tone="error" /> : null}
        <Button
          disabled={submitting}
          onClick={() => {
            const provider = new GoogleAuthProvider();
            provider.setCustomParameters({ prompt: "select_account" });
            void signInWithPopup(auth, provider);
          }}
          size="large"
          startIcon={<GoogleIcon />}
          type="button"
          variant="contained"
        >
          {intl.formatMessage({ id: "signIn.googleButton" })}
        </Button>
        {passwordAuthEnabled ? (
          <>
            <Divider />
            <Box component="form" onSubmit={handleEmailPasswordSignIn}>
              <Stack spacing={2}>
                <Typography variant="subtitle1">{intl.formatMessage({ id: "signIn.passwordSection" })}</Typography>
                <TextField label={intl.formatMessage({ id: "signIn.email" })} name="email" type="email" />
                <TextField label={intl.formatMessage({ id: "signIn.password" })} name="password" type="password" />
                <Box>
                  <Button disabled={submitting} type="submit" variant="outlined">
                    {intl.formatMessage({ id: "signIn.submit" })}
                  </Button>
                </Box>
              </Stack>
            </Box>
          </>
        ) : null}
      </Stack>
    </Paper>
  );
}
