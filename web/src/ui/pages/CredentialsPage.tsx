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
import { Link as RouterLink } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { useAvailableCredentials } from "../../credentials/useAvailableCredentials";
import { FormNotice } from "../components/FormNotice";
import { providerLabel } from "../providerLabel";
import { statusLabel } from "../statusLabel";

export function CredentialsPage() {
  const { user } = useAuth();
  const { credentials, loading, error: loadError } = useAvailableCredentials(user?.uid ?? null, user?.email ?? null);
  const ownedCredentials = credentials.filter((credential) => credential.ownerUid === user?.uid);
  const sharedCredentials = credentials.filter((credential) => credential.ownerUid !== user?.uid);

  return (
    <Stack spacing={3}>
      <Stack alignItems="center" direction="row" justifyContent="space-between" spacing={2}>
        <Typography variant="h4">認証情報</Typography>
        <Button component={RouterLink} startIcon={<AddIcon />} to="/credentials/new" variant="contained">
          新規登録
        </Button>
      </Stack>

      {loadError !== null ? <FormNotice message={loadError} tone="error" /> : null}

      <Stack spacing={2}>
        <Typography variant="h5">自分の認証情報</Typography>
        <TableContainer component={Paper} variant="outlined">
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>名称</TableCell>
                <TableCell>プロバイダ</TableCell>
                <TableCell>共有</TableCell>
                <TableCell>状態</TableCell>
                <TableCell align="right">操作</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {ownedCredentials.map((credential) => (
                <TableRow hover key={credential.id}>
                  <TableCell>{credential.label}</TableCell>
                  <TableCell>{providerLabel(credential.provider)}</TableCell>
                  <TableCell>{credential.allowedUserEmails.length + credential.allowedDomains.length}</TableCell>
                  <TableCell>
                    <Chip
                      color={credential.status === "active" ? "success" : "default"}
                      label={statusLabel(credential.status)}
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
                      詳細
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
                    登録
                  </Button>
                }
                severity="info"
              >
                自分の認証情報はまだありません。
              </Alert>
            </Box>
          ) : null}
        </TableContainer>
      </Stack>

      <Stack spacing={2}>
        <Typography variant="h5">共有された認証情報</Typography>
        <TableContainer component={Paper} variant="outlined">
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>名称</TableCell>
                <TableCell>プロバイダ</TableCell>
                <TableCell>所有者</TableCell>
                <TableCell>状態</TableCell>
                <TableCell align="right">操作</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sharedCredentials.map((credential) => (
                <TableRow hover key={credential.id}>
                  <TableCell>{credential.label}</TableCell>
                  <TableCell>{providerLabel(credential.provider)}</TableCell>
                  <TableCell>{credential.ownerEmail}</TableCell>
                  <TableCell>
                    <Chip
                      color={credential.status === "active" ? "success" : "default"}
                      label={statusLabel(credential.status)}
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
                      詳細
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!loading && sharedCredentials.length === 0 ? (
            <Box sx={{ p: 3 }}>
              <Alert severity="info">共有された認証情報はありません。</Alert>
            </Box>
          ) : null}
        </TableContainer>
      </Stack>
    </Stack>
  );
}
