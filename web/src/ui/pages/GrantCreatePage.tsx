import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { createGrant } from "../../api/management";
import { useAuth } from "../../auth/AuthProvider";
import { useCredential } from "../../credentials/useCredential";
import { FormNotice } from "../components/FormNotice";
import { providerLabel } from "../providerLabel";

export function GrantCreatePage() {
  const { credentialId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { credential, loading, error: credentialError } = useCredential(credentialId);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isOwner = credential !== null && user !== null && credential.ownerUid === user.uid;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (credentialId === undefined) {
      return;
    }

    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setError(null);

    try {
      await createGrant(credentialId, {
        granteeType: String(form.get("granteeType")) as "user_email" | "email_domain",
        granteeValue: String(form.get("granteeValue")),
      });
      navigate(`/credentials/${credentialId}`);
    } catch (caught: unknown) {
      setError((caught as Error).message);
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
  }

  return (
    <Stack sx={{ mx: "auto", width: "100%", maxWidth: 640 }} spacing={3}>
      <Typography variant="h4">共有を追加</Typography>
      {credentialError !== null ? <FormNotice message={credentialError} tone="error" /> : null}
      {loading ? (
        <Paper sx={{ p: 4 }} variant="outlined">
          <Stack alignItems="center" spacing={2}>
            <CircularProgress size={28} />
          </Stack>
        </Paper>
      ) : null}
      {!loading && credential === null ? (
        <Paper sx={{ p: 3 }} variant="outlined">
          <Stack spacing={2}>
            <Typography>認証情報が見つかりません。</Typography>
            <Box>
              <Button color="inherit" onClick={() => navigate("/credentials")} type="button">
                一覧に戻る
              </Button>
            </Box>
          </Stack>
        </Paper>
      ) : null}
      {!loading && credential !== null && !isOwner ? (
        <Paper sx={{ p: 3 }} variant="outlined">
          <Stack spacing={2}>
            <Typography>この認証情報には共有を追加できません。</Typography>
            <Box>
              <Button color="inherit" onClick={() => navigate(`/credentials/${credentialId}`)} type="button">
                詳細に戻る
              </Button>
            </Box>
          </Stack>
        </Paper>
      ) : null}
      {!loading && credential !== null && isOwner ? (
      <Paper component="form" onSubmit={handleSubmit} sx={{ p: 3 }} variant="outlined">
        <Stack spacing={2.5}>
          <Stack spacing={1}>
            <Typography variant="subtitle1">{credential.label}</Typography>
            <Stack direction="row" spacing={1}>
              <Chip label={providerLabel(credential.provider)} size="small" variant="outlined" />
              <Chip label={credential.ownerEmail} size="small" variant="outlined" />
            </Stack>
          </Stack>
          <TextField defaultValue="user_email" label="共有先の種類" name="granteeType" select>
            <MenuItem value="user_email">個人メールアドレス</MenuItem>
            <MenuItem value="email_domain">メールドメイン</MenuItem>
          </TextField>
          <TextField label="共有先" name="granteeValue" placeholder="learner@example.com" />
          {error !== null ? <FormNotice message={error} tone="error" /> : null}
          <Stack direction="row" justifyContent="space-between">
            <Button color="inherit" onClick={() => navigate(`/credentials/${credentialId}`)} type="button">
              戻る
            </Button>
            <Button disabled={submitting} type="submit" variant="contained">
              作成
            </Button>
          </Stack>
        </Stack>
      </Paper>
      ) : null}
    </Stack>
  );
}
