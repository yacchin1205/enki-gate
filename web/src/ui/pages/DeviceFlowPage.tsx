import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import GoogleIcon from "@mui/icons-material/Google";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Paper from "@mui/material/Paper";
import Radio from "@mui/material/Radio";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { useRef, type ChangeEvent, type ClipboardEvent, type FormEvent, type KeyboardEvent } from "react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { authorizeDeviceFlow } from "../../api/management";
import { useAuth } from "../../auth/AuthProvider";
import { useAvailableCredentials } from "../../credentials/useAvailableCredentials";
import { auth } from "../../lib/firebase";
import { FormNotice } from "../components/FormNotice";
import { providerLabel } from "../providerLabel";
import { statusLabel } from "../statusLabel";

function normalizeCodeCharacter(value: string) {
  return value.replace(/[^0-9a-z]/gi, "").toUpperCase().slice(0, 4);
}

function normalizeFullUserCode(value: string) {
  return value.replace(/[^0-9a-z]/gi, "").toUpperCase().slice(0, 8);
}

export function DeviceFlowPage() {
  const { ready, user } = useAuth();
  const navigate = useNavigate();
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const [userCodeCharacters, setUserCodeCharacters] = useState<string[]>(["", "", "", "", "", "", "", ""]);
  const [step, setStep] = useState<"userCode" | "credential">("userCode");
  const [selectedCredentialId, setSelectedCredentialId] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { credentials, loading, error: loadError } = useAvailableCredentials(user?.uid ?? null, user?.email ?? null);
  const userCode = useMemo(
    () => `${userCodeCharacters.slice(0, 4).join("")}-${userCodeCharacters.slice(4).join("")}`,
    [userCodeCharacters],
  );
  const isUserCodeReady = userCodeCharacters.every((character) => character.length === 1);

  function handleCharacterChange(index: number, event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const nextCharacter = normalizeCodeCharacter(event.target.value).slice(0, 1);
    const nextCodeCharacters = [...userCodeCharacters];
    nextCodeCharacters[index] = nextCharacter;
    setUserCodeCharacters(nextCodeCharacters);
    setStep("userCode");
    setSelectedCredentialId("");

    if (nextCharacter.length === 1 && index < 7) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleCharacterKeyDown(index: number, event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Backspace" && userCodeCharacters[index] === "" && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  function handleCodePaste(event: ClipboardEvent<HTMLDivElement>) {
    const pasted = normalizeFullUserCode(event.clipboardData.getData("text"));
    if (pasted.length === 0) {
      return;
    }

    event.preventDefault();

    const nextCodeCharacters = ["", "", "", "", "", "", "", ""];
    pasted.split("").forEach((character, index) => {
      nextCodeCharacters[index] = character;
    });
    setUserCodeCharacters(nextCodeCharacters);
    setStep("userCode");
    setSelectedCredentialId("");

    const focusIndex = Math.min(pasted.length, 8) - 1;
    if (focusIndex >= 0) {
      inputRefs.current[focusIndex]?.focus();
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isUserCodeReady) {
      return;
    }

    const selected = credentials.find((credential) => credential.id === selectedCredentialId);
    if (selected === undefined) {
      return;
    }

    setSubmitting(true);
    setActionError(null);

    try {
      await authorizeDeviceFlow({
        userCode,
        credentialId: selectedCredentialId,
      });
    } catch (caught: unknown) {
      setActionError((caught as Error).message);
      setSubmitting(false);
      return;
    }

    navigate("/device/complete", {
      state: {
        credentialLabel: selected.label,
        userCode,
      },
    });
    setSubmitting(false);
  }

  if (!ready) {
    return (
      <Paper sx={{ p: 4 }} variant="outlined">
        <Stack alignItems="center" spacing={2}>
          <CircularProgress size={28} />
        </Stack>
      </Paper>
    );
  }

  if (user === null) {
    return (
      <Paper sx={{ p: 4 }} variant="outlined">
        <Stack spacing={3}>
          <Typography variant="h5">ユーザーコード</Typography>
          <Typography color="text.secondary">続行するにはサインインしてください。</Typography>
          <Button
            startIcon={<GoogleIcon />}
            onClick={() => {
              const provider = new GoogleAuthProvider();
              provider.setCustomParameters({ prompt: "select_account" });
              void signInWithPopup(auth, provider);
            }}
            type="button"
            variant="contained"
          >
            Google でサインイン
          </Button>
        </Stack>
      </Paper>
    );
  }

  return (
    <Paper component="form" onSubmit={handleSubmit} sx={{ p: 4 }} variant="outlined">
      <Stack spacing={3}>
        {step === "userCode" ? (
          <>
            <Typography variant="h5">ユーザーコード</Typography>
            <Typography color="text.secondary">
              クライアントに表示されたユーザーコードを入力してください。
            </Typography>
            <Stack spacing={1}>
              <Typography variant="body2">ユーザーコード</Typography>
              <Stack alignItems="center" direction="row" onPaste={handleCodePaste} spacing={1}>
                {userCodeCharacters.map((character, index) => (
                  <TextField
                    autoComplete="off"
                    inputProps={{ maxLength: 1, style: { textAlign: "center" } }}
                    inputRef={(element) => {
                      inputRefs.current[index] = element;
                    }}
                    key={index}
                    onChange={(event) => handleCharacterChange(index, event)}
                    onKeyDown={(event) => handleCharacterKeyDown(index, event)}
                    sx={{ width: 56 }}
                    value={character}
                  />
                ))}
              </Stack>
            </Stack>
          </>
        ) : null}
        {loadError !== null ? <FormNotice message={loadError} tone="error" /> : null}
        {actionError !== null ? <FormNotice message={actionError} tone="error" /> : null}
        {step === "userCode" ? (
          <Stack spacing={2}>
            <Box>
              <Button disabled={!isUserCodeReady} onClick={() => setStep("credential")} type="button" variant="contained">
                次へ
              </Button>
            </Box>
          </Stack>
        ) : null}
        {step === "credential" ? (
          <Stack spacing={3}>
            <Typography variant="h6">認証情報を選択</Typography>
            <Box>
              <Chip label={`ユーザーコード: ${userCode}`} variant="outlined" />
            </Box>
            {loading ? (
              <Stack alignItems="center" sx={{ py: 4 }}>
                <CircularProgress size={28} />
              </Stack>
            ) : null}
            {!loading && credentials.length === 0 ? (
              <Alert severity="info">使える認証情報がありません。</Alert>
            ) : null}
            {credentials.length > 0 ? (
              <List disablePadding sx={{ border: 1, borderColor: "divider", borderRadius: 2 }}>
                {credentials.map((credential, index) => (
                  <ListItem
                    disablePadding
                    divider={index < credentials.length - 1}
                    key={credential.id}
                    secondaryAction={
                      <Chip
                        color={credential.status === "active" ? "success" : "default"}
                        label={statusLabel(credential.status)}
                        size="small"
                      />
                    }
                  >
                    <ListItemButton
                      onClick={() => setSelectedCredentialId(credential.id)}
                      selected={selectedCredentialId === credential.id}
                    >
                      <Radio checked={selectedCredentialId === credential.id} tabIndex={-1} value={credential.id} />
                      <ListItemText
                        primary={credential.label}
                        secondary={`${providerLabel(credential.provider)} · ${credential.ownerEmail}`}
                      />
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            ) : null}
            <Stack direction="row" justifyContent="space-between">
              <Button color="inherit" onClick={() => setStep("userCode")} type="button">
                戻る
              </Button>
              <Button
                disabled={submitting || selectedCredentialId.length === 0}
                startIcon={<CheckCircleOutlineIcon />}
                type="submit"
                variant="contained"
              >
                この認証情報を使う
              </Button>
            </Stack>
          </Stack>
        ) : null}
      </Stack>
    </Paper>
  );
}
