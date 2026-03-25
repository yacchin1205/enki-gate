import CircularProgress from "@mui/material/CircularProgress";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { signOut } from "firebase/auth";
import { useEffect } from "react";
import { useIntl } from "react-intl";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { auth } from "../../lib/firebase";

export function LogoutPage() {
  const navigate = useNavigate();
  const { ready, user } = useAuth();
  const intl = useIntl();

  useEffect(() => {
    if (!ready) {
      return;
    }

    if (user === null) {
      navigate("/sign-in", { replace: true });
      return;
    }

    void signOut(auth);
  }, [navigate, ready, user]);

  return (
    <Paper sx={{ p: 4 }} variant="outlined">
      <Stack alignItems="center" spacing={2}>
        <CircularProgress size={28} />
        <Typography variant="h6">{intl.formatMessage({ id: "logout.title" })}</Typography>
      </Stack>
    </Paper>
  );
}
