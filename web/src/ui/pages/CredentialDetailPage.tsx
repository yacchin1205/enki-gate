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
import { useIntl } from "react-intl";
import { Link as RouterLink, useParams } from "react-router-dom";
import { createGrant, disableCredential, revokeGrant } from "../../api/management";
import { useAuth } from "../../auth/AuthProvider";
import { useCredential } from "../../credentials/useCredential";
import { useOwnedGrants } from "../../grants/useOwnedGrants";
import { FormNotice } from "../components/FormNotice";
import { Sparkline } from "../components/Sparkline";
import { grantStatusLabel } from "../grantStatusLabel";
import { granteeTypeLabel } from "../granteeTypeLabel";
import { providerLabel } from "../providerLabel";
import { statusLabel } from "../statusLabel";

function formatDate(intl: ReturnType<typeof useIntl>, value: Date | undefined) {
  if (value === undefined) {
    return intl.formatMessage({ id: "common.none" });
  }

  return intl.formatDate(value, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatRelativeTime(intl: ReturnType<typeof useIntl>, value: Date | undefined) {
  if (value === undefined) {
    return intl.formatMessage({ id: "common.none" });
  }

  const diffSeconds = Math.max(0, Math.floor((Date.now() - value.getTime()) / 1000));
  if (diffSeconds < 60) {
    return intl.formatRelativeTime(-diffSeconds, "second");
  }

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return intl.formatRelativeTime(-diffMinutes, "minute");
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return intl.formatRelativeTime(-diffHours, "hour");
  }

  const diffDays = Math.floor(diffHours / 24);
  return intl.formatRelativeTime(-diffDays, "day");
}

export function CredentialDetailPage() {
  const { credentialId } = useParams();
  const { user } = useAuth();
  const intl = useIntl();
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
      })).sort((left, right) => {
        if (left.grant.status !== right.grant.status) {
          return left.grant.status === "active" ? -1 : 1;
        }

        return right.grant.updatedAt.getTime() - left.grant.updatedAt.getTime();
      }),
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

  async function handleReactivate(grant: (typeof grants)[number]) {
    if (credentialId === undefined) {
      return;
    }

    setActionError(null);

    try {
      await createGrant(credentialId, {
        granteeType: grant.granteeType,
        granteeValue: grant.granteeValue,
      });
    } catch (caught: unknown) {
      setActionError((caught as Error).message);
    }
  }

  return (
    <Stack spacing={3}>
      <Stack alignItems="center" direction="row" justifyContent="space-between" spacing={2}>
        <Stack direction="row" spacing={1.5}>
          <Typography variant="h4">{credential?.label ?? intl.formatMessage({ id: "credentialDetail.fallbackTitle" })}</Typography>
          {credential !== null ? (
            <Chip
              color={credential.status === "active" ? "success" : "default"}
              label={statusLabel(intl, credential.status)}
            />
          ) : null}
        </Stack>
        {isOwner ? (
          <Button color="inherit" onClick={() => void handleDisable()} type="button" variant="outlined">
            {intl.formatMessage({ id: "credentialDetail.disable" })}
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
              <ListItemText
                primary={intl.formatMessage({ id: "credentialDetail.provider" })}
                secondary={providerLabel(intl, credential.provider)}
              />
            </ListItem>
            <ListItem divider>
              <ListItemText primary={intl.formatMessage({ id: "credentialDetail.owner" })} secondary={credential.ownerEmail} />
            </ListItem>
            <ListItem divider>
              <ListItemText
                primary={intl.formatMessage({ id: "credentialDetail.createdAt" })}
                secondary={formatDate(intl, credential.createdAt)}
              />
            </ListItem>
            <ListItem>
              <ListItemText
                primary={intl.formatMessage({ id: "credentialDetail.updatedAt" })}
                secondary={formatDate(intl, credential.updatedAt)}
              />
            </ListItem>
          </List>
        </Paper>
      ) : null}

      {isOwner ? (
        <>
          <Stack alignItems="center" direction="row" justifyContent="space-between" spacing={2}>
            <Typography variant="h5">{intl.formatMessage({ id: "credentialDetail.sharingSection" })}</Typography>
            <Button
              component={RouterLink}
              startIcon={<AddIcon />}
              to={`/credentials/${credentialId}/grants/new`}
              variant="contained"
            >
              {intl.formatMessage({ id: "credentialDetail.addSharing" })}
            </Button>
          </Stack>

          <TableContainer component={Paper} variant="outlined">
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>{intl.formatMessage({ id: "credentialDetail.table.type" })}</TableCell>
                  <TableCell>{intl.formatMessage({ id: "credentialDetail.table.target" })}</TableCell>
                  <TableCell>{intl.formatMessage({ id: "credentialDetail.table.status" })}</TableCell>
                  <TableCell>{intl.formatMessage({ id: "credentialDetail.table.last7d" })}</TableCell>
                  <TableCell align="right">{intl.formatMessage({ id: "credentialDetail.table.count" })}</TableCell>
                  <TableCell>{intl.formatMessage({ id: "credentialDetail.table.lastAccess" })}</TableCell>
                  <TableCell>{intl.formatMessage({ id: "credentialDetail.table.createdAt" })}</TableCell>
                  <TableCell>{intl.formatMessage({ id: "credentialDetail.table.updatedAt" })}</TableCell>
                  <TableCell align="right">{intl.formatMessage({ id: "credentialDetail.table.action" })}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {grantsWithUsage.map(({ grant, totalCount, sparklineValues }) => (
                  <TableRow hover key={grant.id}>
                    <TableCell>{granteeTypeLabel(intl, grant.granteeType)}</TableCell>
                    <TableCell>{grant.granteeValue}</TableCell>
                    <TableCell>
                      <Chip
                        color={grant.status === "active" ? "success" : "default"}
                        label={grantStatusLabel(intl, grant.status)}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      {grant.usageSummary7d.length > 0 ? <Sparkline values={sparklineValues} /> : intl.formatMessage({ id: "common.none" })}
                    </TableCell>
                    <TableCell align="right">{totalCount}</TableCell>
                    <TableCell>{formatRelativeTime(intl, grant.lastAccessAt)}</TableCell>
                    <TableCell>{formatDate(intl, grant.createdAt)}</TableCell>
                    <TableCell>{formatDate(intl, grant.updatedAt)}</TableCell>
                    <TableCell align="right">
                      {grant.status === "active" ? (
                        <Button color="inherit" onClick={() => void handleRevoke(grant.id)} size="small" type="button">
                          {intl.formatMessage({ id: "credentialDetail.revoke" })}
                        </Button>
                      ) : (
                        <Button color="inherit" onClick={() => void handleReactivate(grant)} size="small" type="button">
                          {intl.formatMessage({ id: "credentialDetail.reactivate" })}
                        </Button>
                      )}
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
                <Alert severity="info">{intl.formatMessage({ id: "credentialDetail.emptyGrants" })}</Alert>
              </Box>
            ) : null}
          </TableContainer>
        </>
      ) : null}
    </Stack>
  );
}
