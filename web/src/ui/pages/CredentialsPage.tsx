import AddIcon from "@mui/icons-material/Add";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { useIntl } from "react-intl";
import { Link as RouterLink } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { useAvailableCredentials } from "../../credentials/useAvailableCredentials";
import { FormNotice } from "../components/FormNotice";
import { providerLabel } from "../providerLabel";
import { statusLabel } from "../statusLabel";

export function CredentialsPage() {
  const { user } = useAuth();
  const intl = useIntl();
  const { credentials, loading, error: loadError } = useAvailableCredentials(user?.uid ?? null, user?.email ?? null);
  const ownedCredentials = credentials.filter((credential) => credential.ownerUid === user?.uid);
  const sharedCredentials = credentials.filter((credential) => credential.ownerUid !== user?.uid);

  return (
    <Stack spacing={3}>
      <Stack alignItems="center" direction="row" justifyContent="space-between" spacing={2}>
        <Typography variant="h4">{intl.formatMessage({ id: "credentials.title" })}</Typography>
        <Button component={RouterLink} startIcon={<AddIcon />} to="/credentials/new" variant="contained">
          {intl.formatMessage({ id: "nav.newCredential" })}
        </Button>
      </Stack>

      {loadError !== null ? <FormNotice message={loadError} tone="error" /> : null}

      <Stack spacing={2}>
        <Typography variant="h5">{intl.formatMessage({ id: "credentials.ownedSection" })}</Typography>
        <TableContainer component={Paper} variant="outlined">
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>{intl.formatMessage({ id: "credentials.table.name" })}</TableCell>
                <TableCell>{intl.formatMessage({ id: "credentials.table.provider" })}</TableCell>
                <TableCell>{intl.formatMessage({ id: "credentials.table.shareCount" })}</TableCell>
                <TableCell>{intl.formatMessage({ id: "credentials.table.status" })}</TableCell>
                <TableCell align="right">{intl.formatMessage({ id: "credentials.table.action" })}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {ownedCredentials.map((credential) => (
                <TableRow hover key={credential.id}>
                  <TableCell>{credential.label}</TableCell>
                  <TableCell>{providerLabel(intl, credential.provider)}</TableCell>
                  <TableCell>{credential.allowedUserEmails.length + credential.allowedDomains.length}</TableCell>
                  <TableCell>
                    <Chip
                      color={credential.status === "active" ? "success" : "default"}
                      label={statusLabel(intl, credential.status)}
                      size="small"
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Button
                      component={RouterLink}
                      endIcon={<EditOutlinedIcon />}
                      size="small"
                      to={`/credentials/${credential.id}`}
                    >
                      {intl.formatMessage({ id: "common.details" })}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {loading ? (
            <Stack alignItems="center" justifyContent="center" spacing={1} sx={{ py: 6 }}>
              <CircularProgress size={28} />
            </Stack>
          ) : null}
          {!loading && ownedCredentials.length === 0 ? (
            <Box sx={{ p: 3 }}>
              <Alert
                action={
                  <Button component={RouterLink} size="small" to="/credentials/new">
                    {intl.formatMessage({ id: "common.register" })}
                  </Button>
                }
                severity="info"
              >
                {intl.formatMessage({ id: "credentials.emptyOwned" })}
              </Alert>
            </Box>
          ) : null}
        </TableContainer>
      </Stack>

      <Stack spacing={2}>
        <Typography variant="h5">{intl.formatMessage({ id: "credentials.sharedSection" })}</Typography>
        <TableContainer component={Paper} variant="outlined">
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>{intl.formatMessage({ id: "credentials.table.name" })}</TableCell>
                <TableCell>{intl.formatMessage({ id: "credentials.table.provider" })}</TableCell>
                <TableCell>{intl.formatMessage({ id: "credentials.table.owner" })}</TableCell>
                <TableCell>{intl.formatMessage({ id: "credentials.table.status" })}</TableCell>
                <TableCell align="right">{intl.formatMessage({ id: "credentials.table.action" })}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sharedCredentials.map((credential) => (
                <TableRow hover key={credential.id}>
                  <TableCell>{credential.label}</TableCell>
                  <TableCell>{providerLabel(intl, credential.provider)}</TableCell>
                  <TableCell>{credential.ownerEmail}</TableCell>
                  <TableCell>
                    <Chip
                      color={credential.status === "active" ? "success" : "default"}
                      label={statusLabel(intl, credential.status)}
                      size="small"
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Button
                      component={RouterLink}
                      endIcon={<EditOutlinedIcon />}
                      size="small"
                      to={`/credentials/${credential.id}`}
                    >
                      {intl.formatMessage({ id: "common.details" })}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!loading && sharedCredentials.length === 0 ? (
            <Box sx={{ p: 3 }}>
              <Alert severity="info">{intl.formatMessage({ id: "credentials.emptyShared" })}</Alert>
            </Box>
          ) : null}
        </TableContainer>
      </Stack>
    </Stack>
  );
}
