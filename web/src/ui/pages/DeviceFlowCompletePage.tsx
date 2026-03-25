import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useEffect, useState } from "react";
import { useIntl } from "react-intl";
import { Navigate, useLocation } from "react-router-dom";
import { getDeviceFlowStatus } from "../../api/management";

type DeviceFlowCompleteState = {
  credentialLabel?: string;
  userCode?: string;
};

export function DeviceFlowCompletePage() {
  const location = useLocation();
  const intl = useIntl();
  const state = location.state as DeviceFlowCompleteState | null;
  const [closeReady, setCloseReady] = useState(false);

  if (state?.userCode === undefined) {
    return <Navigate replace to="/device" />;
  }

  const userCode = state.userCode;

  useEffect(() => {
    let active = true;
    const poll = async () => {
      const result = await getDeviceFlowStatus(userCode);
      if (!active) {
        return;
      }

      if (result.status === "completed") {
        setCloseReady(true);
        window.close();
        return;
      }

      window.setTimeout(() => {
        void poll();
      }, 1000);
    };

    void poll();

    return () => {
      active = false;
    };
  }, [userCode]);

  return (
    <Paper sx={{ p: 4 }} variant="outlined">
      <Stack spacing={2.5}>
        <Stack alignItems="center" direction="row" spacing={1.5}>
          <CheckCircleIcon color="success" />
          <Typography variant="h5">{intl.formatMessage({ id: "deviceFlowComplete.title" })}</Typography>
        </Stack>
        <Stack alignItems="center" direction="row" spacing={1.5}>
          {!closeReady ? <CircularProgress size={18} /> : null}
          <Typography color="text.secondary">
            {closeReady
              ? intl.formatMessage({ id: "deviceFlowComplete.closeReady" })
              : intl.formatMessage({ id: "deviceFlowComplete.waiting" })}
          </Typography>
        </Stack>
        {state?.userCode ? (
          <Stack direction="row" spacing={1}>
            <Chip
              label={intl.formatMessage({ id: "deviceFlow.userCodeChip" }, { userCode: state.userCode })}
              variant="outlined"
            />
            {state.credentialLabel ? <Chip label={state.credentialLabel} variant="outlined" /> : null}
          </Stack>
        ) : null}
      </Stack>
    </Paper>
  );
}
