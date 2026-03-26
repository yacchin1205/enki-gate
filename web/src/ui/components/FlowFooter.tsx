import GitHubIcon from "@mui/icons-material/GitHub";
import Box from "@mui/material/Box";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

const repositoryUrl = "https://github.com/yacchin1205/enki-gate";

export function FlowFooter() {
  return (
    <Box sx={{ mt: 3 }}>
      <Stack alignItems="center" direction="row" justifyContent="center" spacing={1}>
        <GitHubIcon color="action" fontSize="small" />
        <Typography color="text.secondary" variant="body2">
          <Link color="inherit" href={repositoryUrl} rel="noopener noreferrer" target="_blank" underline="hover">
            {repositoryUrl}
          </Link>
        </Typography>
      </Stack>
    </Box>
  );
}
