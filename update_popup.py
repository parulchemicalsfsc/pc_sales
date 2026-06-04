import sys

content = open('frontend/src/components/DutySheetPopup.tsx', 'r', encoding='utf-8').read()

# 1. Imports
content = content.replace('import { attendanceAPI } from "../services/api";', 'import { attendanceAPI, automationAPI } from "../services/api";')
content = content.replace('  LinearProgress,\n} from "@mui/material";', '  LinearProgress,\n  Grid,\n  Select,\n  MenuItem,\n  FormControl,\n  InputLabel,\n  TextField,\n  Chip,\n  Stack,\n} from "@mui/material";')
content = content.replace('import {\n  CheckCircle as CheckIcon,', 'import {\n  CheckCircle as CheckIcon,\n  Map as MapIcon,')

# 2. State
state_str = '''  const [step, setStep] = useState(1);
  const [locations, setLocations] = useState<any>({});
  const [selState, setSelState] = useState("");
  const [selDistrict, setSelDistrict] = useState("");
  const [selTaluka, setSelTaluka] = useState("");
  const [selVillage, setSelVillage] = useState("");
  const [sabhsadLimit, setSabhsadLimit] = useState(100);
  const [selectedTelecallers, setSelectedTelecallers] = useState<string[]>([]);'''
content = content.replace('  const [currentTime, setCurrentTime] = useState(getISTTimeString());', '  const [currentTime, setCurrentTime] = useState(getISTTimeString());\n' + state_str)

# 3. Check logic
check_old = '''        if (res.data.should_show_popup) {
          const tcRes = await attendanceAPI.getAllTelecallers();'''
check_new = '''        if (res.data.should_show_popup) {
          const [tcRes, locRes] = await Promise.all([
             attendanceAPI.getAllTelecallers(),
             automationAPI.getLocations().catch(() => ({})),
          ]);
          setLocations(locRes || {});'''
content = content.replace(check_old, check_new)

# 4. Handle Submit modifications
submit_old = '''    try {
      await attendanceAPI.submitDutySheet(
        telecallers.map((tc) => ({ email: tc.email, is_on_duty: tc.is_on_duty }))
      );
      setSubmitSuccess(true);
      setTimeout(() => setOpen(false), 1500);'''
submit_new = '''    try {
      await attendanceAPI.submitDutySheet(
        telecallers.map((tc) => ({ email: tc.email, is_on_duty: tc.is_on_duty }))
      );
      setSubmitSuccess(true);
      setTimeout(() => {
        setStep(2);
        setSubmitSuccess(false);
        setSelectedTelecallers(telecallers.filter(t => t.is_on_duty && t.group === "Telecallers").map(t => t.email));
      }, 1500);'''
content = content.replace(submit_old, submit_new)

already_sub_old = '''      if (status === 409) {
        setSubmitError(t("dutySheet.alreadySubmitted", "Duty sheet was already submitted for today by another user."));
        setTimeout(() => setOpen(false), 2500);'''
already_sub_new = '''      if (status === 409) {
        setSubmitError(t("dutySheet.alreadySubmitted", "Duty sheet was already submitted for today by another user."));
        setTimeout(() => {
          setSubmitError(null);
          setStep(2);
          setSelectedTelecallers(telecallers.filter(t => t.is_on_duty && t.group === "Telecallers").map(t => t.email));
        }, 1500);'''
content = content.replace(already_sub_old, already_sub_new)

# Handle Step 2 submit
handle2 = '''  const handleAssignSabhsads = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload = {
        telecaller_emails: selectedTelecallers,
        state: selState,
        district: selDistrict,
        taluka: selTaluka,
        village: selVillage,
        limit: sabhsadLimit,
      };
      await automationAPI.adminDistributeSabhsads(payload);
      setSubmitSuccess(true);
      setTimeout(() => setOpen(false), 1500);
    } catch (err: any) {
      setSubmitError(err?.response?.data?.detail || "Distribution failed.");
    } finally {
      setSubmitting(false);
    }
  };'''
content = content.replace('  const onDutyCount =', handle2 + '\n\n  const onDutyCount =')

# UI Wrap
step2_ui = '''        {/* ── Step 2: Sabhsad Distribution ── */}
        {step === 2 && (
          <Box sx={{ mt: 2, pb: 4 }}>
            <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
              <MapIcon sx={{ color: T.amber }} />
              <Typography sx={{ fontFamily: T.sans, fontWeight: 600, fontSize: '0.9rem', color: T.textPrimary }}>
                Assign Sabhsads to Present Telecallers
              </Typography>
            </Box>

            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <FormControl size="small" fullWidth>
                  <InputLabel>State</InputLabel>
                  <Select label="State" value={selState} onChange={(e) => { setSelState(e.target.value); setSelDistrict(""); setSelTaluka(""); setSelVillage(""); }} sx={{ borderRadius: 1 }}>
                    <MenuItem value="">All States</MenuItem>
                    {Object.keys(locations).map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl size="small" fullWidth disabled={!selState}>
                  <InputLabel>District</InputLabel>
                  <Select label="District" value={selDistrict} onChange={(e) => { setSelDistrict(e.target.value); setSelTaluka(""); setSelVillage(""); }} sx={{ borderRadius: 1 }}>
                    <MenuItem value="">All Districts</MenuItem>
                    {selState && Object.keys(locations[selState] || {}).map(d => <MenuItem key={d} value={d}>{d}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl size="small" fullWidth disabled={!selDistrict}>
                  <InputLabel>Taluka</InputLabel>
                  <Select label="Taluka" value={selTaluka} onChange={(e) => { setSelTaluka(e.target.value); setSelVillage(""); }} sx={{ borderRadius: 1 }}>
                    <MenuItem value="">All Talukas</MenuItem>
                    {selDistrict && Object.keys(locations[selState]?.[selDistrict] || {}).map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl size="small" fullWidth disabled={!selTaluka}>
                  <InputLabel>Village</InputLabel>
                  <Select label="Village" value={selVillage} onChange={(e) => setSelVillage(e.target.value)} sx={{ borderRadius: 1 }}>
                    <MenuItem value="">All Villages</MenuItem>
                    {selTaluka && (locations[selState]?.[selDistrict]?.[selTaluka] || []).map((v: string) => <MenuItem key={v} value={v}>{v}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={8}>
                <FormControl size="small" fullWidth>
                  <InputLabel>Assign To</InputLabel>
                  <Select
                    label="Assign To"
                    multiple
                    value={selectedTelecallers}
                    onChange={(e) => setSelectedTelecallers(typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value)}
                    sx={{ borderRadius: 1 }}
                    renderValue={(selected) => (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {selected.map((value) => (
                          <Chip key={value} label={telecallers.find(t => t.email === value)?.name || value.split('@')[0]} size="small" />
                        ))}
                      </Box>
                    )}
                  >
                    {telecallers.filter(t => t.is_on_duty && t.group === 'Telecallers').map((t) => (
                      <MenuItem key={t.email} value={t.email}>
                        {t.name || t.email.split("@")[0]}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  size="small"
                  type="number"
                  label="Limit per TC"
                  value={sabhsadLimit}
                  onChange={(e) => setSabhsadLimit(Math.max(1, parseInt(e.target.value) || 1))}
                  fullWidth
                  sx={{ borderRadius: 1 }}
                  inputProps={{ min: 1 }}
                />
              </Grid>
            </Grid>
          </Box>
        )}
'''

content = content.replace('{/* ── Duty summary bar ── */}', '{step === 1 && (<>\n{/* ── Duty summary bar ── */}')
content = content.replace('        {/* ── Actions ── */}', '        </>)}\n' + step2_ui + '\n        {/* ── Actions ── */}')

# Fix Action Buttons
action_old = '''        <Box
          component="button"
          onClick={handleSubmit}'''
action_new = '''        <Box
          component="button"
          onClick={step === 1 ? handleSubmit : handleAssignSabhsads}'''
content = content.replace(action_old, action_new)

# Fix Button Text
btn_text_old = '''          ) : submitSuccess ? (
            <>
              <CheckIcon sx={{ fontSize: 16 }} />
              {t("dutySheet.confirmed", "Duty Sheet Confirmed")}
            </>
          ) : (
            t("dutySheet.submitDutySheet", "Submit Duty Sheet — {count} on duty").replace("{count}", String(onDutyCount))
          )}'''
btn_text_new = '''          ) : submitSuccess ? (
            <>
              <CheckIcon sx={{ fontSize: 16 }} />
              {step === 1 ? t("dutySheet.confirmed", "Duty Sheet Confirmed") : "Distributed Successfully"}
            </>
          ) : step === 1 ? (
            "Next: Assign Villages →"
          ) : (
            "Submit & Distribute"
          )}'''
content = content.replace(btn_text_old, btn_text_new)

open('frontend/src/components/DutySheetPopup.tsx', 'w', encoding='utf-8').write(content)
print("Done")
