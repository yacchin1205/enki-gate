import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import { Outlet } from "react-router-dom";

export function FlowLayout() {
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
            Enki Gate
          </Typography>
        </Box>
        <Outlet />
      </Container>
    </Box>
  );
}
