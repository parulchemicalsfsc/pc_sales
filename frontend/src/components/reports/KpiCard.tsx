import React from "react";
import { Box, Card, CardContent, Skeleton, Typography } from "@mui/material";

export function KpiCard({
  label,
  value,
  percentage,
  subLabel,
  sub,
  icon,
  color,
  loading,
}: {
  label: string;
  value: string;
  percentage?: string;
  subLabel?: string;
  sub?: string;
  icon: React.ReactNode;
  color: string;
  loading: boolean;
}) {
  const finalSub = subLabel || sub;

  return (
    <Card
      sx={{
        height: "100%",
        borderTop: `4px solid ${color}`,
        borderRadius: 2,
        boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
        transition: "transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out",
        "&:hover": { transform: "translateY(-4px)", boxShadow: "0 8px 24px rgba(0,0,0,0.12)" },
      }}
    >
      <CardContent sx={{ p: 3 }}>
        <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8 }}>
              {label}
            </Typography>
            {loading ? (
              <Skeleton width={120} height={40} sx={{ mt: 1 }} />
            ) : (
              <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, mt: 0.5 }}>
                <Typography variant="h4" sx={{ fontWeight: 800, color }}>
                  {value}
                </Typography>
                {percentage && (
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "text.secondary", bgcolor: "action.hover", px: 1, py: 0.25, borderRadius: 1 }}>
                    {percentage}
                  </Typography>
                )}
              </Box>
            )}
            {finalSub && !loading && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
                {finalSub}
              </Typography>
            )}
          </Box>
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              bgcolor: `${color}15`,
              color,
              flexShrink: 0,
            }}
          >
            {icon}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}
