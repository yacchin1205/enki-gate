import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import { Outlet } from "react-router-dom";
import { useIntl } from "react-intl";
import { FlowFooter } from "./components/FlowFooter";

export function FlowLayout() {
  const intl = useIntl();

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        bgcolor: "grey.50",
        py: 6,
      }}
    >
      <Container maxWidth="sm">
        <Box sx={{ mb: 3 }}>
          <Typography component="h1" sx={{ fontWeight: 700 }} variant="h5">
            {intl.formatMessage({ id: "common.appName" })}
          </Typography>
        </Box>
        <Outlet />
        <FlowFooter />
      </Container>
    </Box>
  );
}
