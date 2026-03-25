import AddIcon from "@mui/icons-material/Add";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { useMemo, useState } from "react";
import { Link as RouterLink, useParams } from "react-router-dom";
import { disableCredential, revokeGrant } from "../../api/management";
import { useAuth } from "../../auth/AuthProvider";
import { useCredential } from "../../credentials/useCredential";
import { useOwnedGrants } from "../../grants/useOwnedGrants";
import { FormNotice } from "../components/FormNotice";
import { Sparkline } from "../components/Sparkline";
import { granteeTypeLabel } from "../granteeTypeLabel";
import { providerLabel } from "../providerLabel";
import { statusLabel } from "../statusLabel";

function formatDate(value: Date | undefined) {
  if (value === undefined) {
    return "—";
  }

  return value.toLocaleString("ja-JP");
}

function formatRelativeTime(value: Date | undefined) {
  if (value === undefined) {
    return "—";
  }

  const diffSeconds = Math.max(0, Math.floor((Date.now() - value.getTime()) / 1000));
  if (diffSeconds < 60) {
    return `${diffSeconds}秒前`;
  }

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `${diffMinutes}分前`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}時間前`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}日前`;
}

export function CredentialDetailPage() {
  const { credentialId } = useParams();
  const { user } = useAuth();
  const { credential, loading: credentialLoading, error: credentialError } = useCredential(credentialId);
  const { grants, loading: grantsLoading, error: grantsError } = useOwnedGrants(user?.uid ?? null, credentialId);
  const [actionError, setActionError] = useState<string | null>(null);
  const isOwner = credential !== null && user !== null && credential.ownerUid === user.uid;
  const grantsWithUsage = useMemo(
    () =>
      grants.map((grant) => ({
        grant,
        totalCount: grant.usageSummary7d.reduce((sum, point) => sum + point.requestCount, 0),
        sparklineValues: grant.usageSummary7d.map((point) => point.requestCount),
      })),
    [grants],
  );

  async function handleDisable() {
    if (credentialId === undefined) {
      return;
    }

    setActionError(null);

    try {
      await disableCredential(credentialId);
    } catch (caught: unknown) {
      setActionError((caught as Error).message);
    }
  }

  async function handleRevoke(grantId: string) {
    setActionError(null);

    try {
      await revokeGrant(grantId);
    } catch (caught: unknown) {
      setActionError((caught as Error).message);
    }
  }

  return (
    <Stack spacing={3}>
      <Stack alignItems="center" direction="row" justifyContent="space-between" spacing={2}>
        <Stack direction="row" spacing={1.5}>
          <Typography variant="h4">{credential?.label ?? "認証情報 詳細"}</Typography>
          {credential !== null ? (
            <Chip color={credential.status === "active" ? "success" : "default"} label={statusLabel(credential.status)} />
          ) : null}
        </Stack>
        {isOwner ? (
          <Button color="inherit" onClick={() => void handleDisable()} type="button" variant="outlined">
            無効化
          </Button>
        ) : null}
      </Stack>

      {credentialError !== null ? <FormNotice message={credentialError} tone="error" /> : null}
      {grantsError !== null ? <FormNotice message={grantsError} tone="error" /> : null}
      {actionError !== null ? <FormNotice message={actionError} tone="error" /> : null}
      {credentialLoading ? (
        <Stack alignItems="center" justifyContent="center" sx={{ py: 8 }}>
          <CircularProgress size={28} />
        </Stack>
      ) : null}

      {credential !== null ? (
        <Paper variant="outlined">
          <List disablePadding>
            <ListItem divider>
              <ListItemText primary="プロバイダ" secondary={providerLabel(credential.provider)} />
            </ListItem>
            <ListItem divider>
              <ListItemText primary="所有者" secondary={credential.ownerEmail} />
            </ListItem>
            <ListItem divider>
              <ListItemText primary="作成日時" secondary={formatDate(credential.createdAt)} />
            </ListItem>
            <ListItem>
              <ListItemText primary="更新日時" secondary={formatDate(credential.updatedAt)} />
            </ListItem>
          </List>
        </Paper>
      ) : null}

      {isOwner ? (
        <>
          <Stack alignItems="center" direction="row" justifyContent="space-between" spacing={2}>
            <Typography variant="h5">共有</Typography>
            <Button
              component={RouterLink}
              startIcon={<AddIcon />}
              to={`/credentials/${credentialId}/grants/new`}
              variant="contained"
            >
              共有を追加
            </Button>
          </Stack>

          <TableContainer component={Paper} variant="outlined">
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>種類</TableCell>
                  <TableCell>共有先</TableCell>
                  <TableCell>直近7日</TableCell>
                  <TableCell align="right">回数</TableCell>
                  <TableCell>直近アクセス</TableCell>
                  <TableCell>作成日時</TableCell>
                  <TableCell align="right">操作</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {grantsWithUsage.map(({ grant, totalCount, sparklineValues }) => (
                  <TableRow hover key={grant.id}>
                    <TableCell>{granteeTypeLabel(grant.granteeType)}</TableCell>
                    <TableCell>{grant.granteeValue}</TableCell>
                    <TableCell>{grant.usageSummary7d.length > 0 ? <Sparkline values={sparklineValues} /> : "—"}</TableCell>
                    <TableCell align="right">{totalCount}</TableCell>
                    <TableCell>{formatRelativeTime(grant.lastAccessAt)}</TableCell>
                    <TableCell>{formatDate(grant.createdAt)}</TableCell>
                    <TableCell align="right">
                      <Button color="inherit" onClick={() => void handleRevoke(grant.id)} size="small" type="button">
                        取り消し
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {grantsLoading ? (
              <Stack alignItems="center" justifyContent="center" spacing={1} sx={{ py: 6 }}>
                <CircularProgress size={28} />
              </Stack>
            ) : null}
            {!grantsLoading && grants.length === 0 ? (
              <Box sx={{ p: 3 }}>
                <Alert severity="info">共有はまだありません。</Alert>
              </Box>
            ) : null}
          </TableContainer>
        </>
      ) : null}
    </Stack>
  );
}
