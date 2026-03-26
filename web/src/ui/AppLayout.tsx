import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import KeyIcon from "@mui/icons-material/Key";
import AddIcon from "@mui/icons-material/Add";
import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import { useState, type MouseEvent } from "react";
import { useIntl } from "react-intl";
import { Link as RouterLink, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { AppFooter } from "./components/AppFooter";

export function AppLayout() {
  const { user } = useAuth();
  const intl = useIntl();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  function handleMenuOpen(event: MouseEvent<HTMLElement>) {
    setAnchorEl(event.currentTarget);
  }

  function handleMenuClose() {
    setAnchorEl(null);
  }

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default", display: "flex", flexDirection: "column" }}>
      <AppBar color="inherit" elevation={0} position="sticky" sx={{ borderBottom: 1, borderColor: "divider" }}>
        <Toolbar sx={{ gap: 2 }}>
          <Typography
            color="text.primary"
            component={RouterLink}
            sx={{ fontWeight: 700 }}
            to="/credentials"
            variant="h6"
          >
            {intl.formatMessage({ id: "common.appName" })}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ flexGrow: 1 }}>
            <Button
              color="inherit"
              component={NavLink}
              startIcon={<KeyIcon />}
              sx={{ "&.active": { bgcolor: "action.selected" } }}
              to="/credentials"
              variant="text"
            >
              {intl.formatMessage({ id: "nav.credentials" })}
            </Button>
            <Button color="inherit" component={RouterLink} startIcon={<AddIcon />} to="/credentials/new" variant="text">
              {intl.formatMessage({ id: "nav.newCredential" })}
            </Button>
          </Stack>
          <Button
            color="inherit"
            onClick={handleMenuOpen}
            startIcon={<AccountCircleIcon />}
            sx={{ textTransform: "none" }}
          >
            {user?.email}
          </Button>
          <Menu anchorEl={anchorEl} onClose={handleMenuClose} open={anchorEl !== null}>
            <MenuItem component={RouterLink} onClick={handleMenuClose} to="/logout">
              {intl.formatMessage({ id: "nav.signOut" })}
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>
      <Container maxWidth="lg" sx={{ py: 4, flexGrow: 1 }}>
        <Outlet />
      </Container>
      <AppFooter />
    </Box>
  );
}
