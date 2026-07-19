import { useState } from "react";
import { Box, Tabs, Tab } from "@mui/material";
import SalesReports from "../components/reports/SalesReports";
import TelecallerReports from "../components/reports/TelecallerReports";

export default function Reports() {
  const [activeTab, setActiveTab] = useState(0);
  const tabs = ["Sales Reports", "Telecaller Reports"];

  return (
    <Box sx={{ width: "100%" }}>
      <Box sx={{ borderBottom: 1, borderColor: "divider", mb: 3 }}>
        <Tabs
          value={activeTab}
          onChange={(_, newValue) => setActiveTab(newValue)}
          aria-label="reports tabs"
        >
          {tabs.map((tab, index) => (
            <Tab key={index} label={tab} sx={{ fontWeight: 600, px: 3 }} />
          ))}
        </Tabs>
      </Box>

      {activeTab === 0 && <SalesReports />}
      {activeTab === 1 && <TelecallerReports />}
    </Box>
  );
}
