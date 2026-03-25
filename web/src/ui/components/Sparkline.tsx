import Box from "@mui/material/Box";

type SparklineProps = {
  values: number[];
};

export function Sparkline({ values }: SparklineProps) {
  const width = 96;
  const height = 28;
  const padding = 3;
  const maxValue = Math.max(...values, 1);
  const step = values.length > 1 ? (width - padding * 2) / (values.length - 1) : 0;

  const points = values
    .map((value, index) => {
      const x = padding + step * index;
      const y = height - padding - (value / maxValue) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <Box sx={{ display: "inline-flex", alignItems: "center", height }}>
      <svg height={height} viewBox={`0 0 ${width} ${height}`} width={width}>
        <polyline
          fill="none"
          points={points}
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
      </svg>
    </Box>
  );
}
