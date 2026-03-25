import type { CredentialProvider } from "@enki-gate/domain";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { createCredential } from "../../api/management";
import { FormNotice } from "../components/FormNotice";

export function NewCredentialPage() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setError(null);

    try {
      const result = await createCredential({
        provider: String(form.get("provider")) as CredentialProvider,
        label: String(form.get("label")),
        apiKey: String(form.get("apiKey")),
      });
      navigate(`/credentials/${result.credentialId}`);
    } catch (caught: unknown) {
      setError((caught as Error).message);
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
  }

  return (
    <Box sx={{ mx: "auto", width: "100%", maxWidth: 640 }}>
      <Stack spacing={3}>
        <Typography variant="h4">認証情報 登録</Typography>
        <Paper component="form" onSubmit={handleSubmit} sx={{ p: 3 }} variant="outlined">
          <Stack spacing={2.5}>
            <TextField defaultValue="openai" label="プロバイダ" name="provider" select>
              <MenuItem value="openai">OpenAI</MenuItem>
              <MenuItem value="anthropic">Anthropic</MenuItem>
            </TextField>
            <TextField label="名称" name="label" placeholder="OpenAI 個人用" />
            <TextField label="API キー" name="apiKey" placeholder="sk-..." type="password" />
            {error !== null ? <FormNotice message={error} tone="error" /> : null}
            <Stack direction="row" justifyContent="flex-end">
              <Button disabled={submitting} type="submit" variant="contained">
                登録
              </Button>
            </Stack>
          </Stack>
        </Paper>
      </Stack>
    </Box>
  );
}
