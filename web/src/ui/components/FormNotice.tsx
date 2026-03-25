import Alert from "@mui/material/Alert";

type FormNoticeProps = {
  message: string;
  tone?: "info" | "error";
};

export function FormNotice({ message, tone = "info" }: FormNoticeProps) {
  return <Alert severity={tone === "error" ? "error" : "info"}>{message}</Alert>;
}
