import GitHubIcon from "@mui/icons-material/GitHub";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

const repositoryUrl = "https://github.com/yacchin1205/enki-gate";

export function AppFooter() {
  return (
    <Box component="footer" sx={{ borderTop: 1, borderColor: "divider", py: 2 }}>
      <Container maxWidth="lg">
        <Stack alignItems="center" direction="row" justifyContent="center" spacing={1}>
          <GitHubIcon color="action" fontSize="small" />
          <Typography color="text.secondary" variant="body2">
            <Link color="inherit" href={repositoryUrl} rel="noopener noreferrer" target="_blank" underline="hover">
              {repositoryUrl}
            </Link>
          </Typography>
        </Stack>
      </Container>
    </Box>
  );
}
