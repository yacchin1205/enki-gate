import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import Chip from "@mui/material/Chip";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useLocation } from "react-router-dom";

type DeviceFlowCompleteState = {
  credentialLabel?: string;
  userCode?: string;
};

export function DeviceFlowCompletePage() {
  const location = useLocation();
  const state = location.state as DeviceFlowCompleteState | null;

  return (
    <Paper sx={{ p: 4 }} variant="outlined">
      <Stack spacing={2.5}>
        <Stack alignItems="center" direction="row" spacing={1.5}>
          <CheckCircleIcon color="success" />
          <Typography variant="h5">認可しました</Typography>
        </Stack>
        <Typography color="text.secondary">クライアント側で処理が進むまで、このまま待ってください。</Typography>
        {state?.userCode ? (
          <Stack direction="row" spacing={1}>
            <Chip label={`ユーザーコード: ${state.userCode}`} variant="outlined" />
            {state.credentialLabel ? <Chip label={state.credentialLabel} variant="outlined" /> : null}
          </Stack>
        ) : null}
      </Stack>
    </Paper>
  );
}
