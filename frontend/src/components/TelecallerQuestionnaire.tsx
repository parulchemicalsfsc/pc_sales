import React, { useState } from "react";
import {
  Box,
  Typography,
  Stack,
  Button,
  ButtonGroup,
  TextField,
  Chip,
  Grid,
  Divider,
  Paper,
  alpha,
  useTheme,
  IconButton,
  Tooltip,
  Collapse,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import AssignmentTurnedInIcon from "@mui/icons-material/AssignmentTurnedIn";
import PetsIcon from "@mui/icons-material/Pets";
import MedicalServicesIcon from "@mui/icons-material/MedicalServices";
import ReportProblemIcon from "@mui/icons-material/ReportProblem";
import TranslateIcon from "@mui/icons-material/Translate";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import { useLanguageStore } from "../store/languageStore";

export type QuestionnaireLang = "gu" | "en" | "hi";

export interface QuestionnaireData {
  isPashupalak: string; // "yes" | "no" | ""
  yearsExperience: string;
  totalAnimals: string;
  
  // Animal breakdown
  cowsCount: string;
  buffaloesCount: string;
  bigAnimalsCount: string;
  smallAnimalsCount: string;
  milkingCount: string;
  nonMilkingCount: string;
  pregnantCount: string;
  nonPregnantCount: string;

  // Supplements
  hasGivenCalcium: string; // "yes" | "no" | ""
  calciumCompany: string;

  // Problems & Breeds
  animalProblems: string[];
  otherProblemDetails: string;
  breedCategories: string[];
  otherBreedDetails: string;

  // Other product issues
  hasOtherProductIssues: string; // "yes" | "no" | ""
  otherProductIssuesDetails: string;
}

export const initialQuestionnaireData: QuestionnaireData = {
  isPashupalak: "",
  yearsExperience: "",
  totalAnimals: "",
  cowsCount: "",
  buffaloesCount: "",
  bigAnimalsCount: "",
  smallAnimalsCount: "",
  milkingCount: "",
  nonMilkingCount: "",
  pregnantCount: "",
  nonPregnantCount: "",
  hasGivenCalcium: "",
  calciumCompany: "",
  animalProblems: [],
  otherProblemDetails: "",
  breedCategories: [],
  otherBreedDetails: "",
  hasOtherProductIssues: "",
  otherProductIssuesDetails: "",
};

// ── Multi-language dictionary ──────────────────────────────────────────────
const T = {
  en: {
    headerTitle: "Customer Questionnaire (Pashupalan)",
    headerSubtitle: "Collect cattle farmer profile & product feedback",
    togglePrompt: "Select Language:",
    
    // Q1
    q1Title: "1. Is the customer a cattle rearer (Pashupalak)?",
    q1Sub: "Pashu palak che ke nai",
    yes: "Yes",
    no: "No",

    // Q2
    q2Title: "2. Years of experience in cattle rearing",
    q2Sub: "Years of experience",
    expYearsPlaceholder: "e.g. 5 years",

    // Q3
    q3Title: "3. Total number of animals",
    q3Sub: "How many animals in total?",
    totalAnimalsPlaceholder: "Total count",

    // Q4
    q4Title: "4. Animal breakdown",
    q4Sub: "Big / small / cow / buffalo / milking / not milking / pregnant / non-pregnant",
    cows: "Cows",
    buffaloes: "Buffaloes",
    bigAnimals: "Big (Adults)",
    smallAnimals: "Small (Calves)",
    milking: "Milking",
    nonMilking: "Not Milking (Dry)",
    pregnant: "Pregnant",
    nonPregnant: "Non-Pregnant (Open)",

    // Q5
    q5Title: "5. Calcium or any type of liquid feed supplements given?",
    q5Sub: "Calcium or any liquid feed supplements apiyu che?",

    // Q6
    q6Title: "6. Which company's calcium have you used?",
    q6Sub: "Which company have you used calcium?",
    calciumCompanyPlaceholder: "e.g. Parul Chemicals (Calcival), Intas, Virbac...",

    // Q7
    q7Title: "7. Problems / health issues of those animals",
    q7Sub: "Problems of those animals",
    probMilkDrop: "Milk Yield Drop",
    probWeakness: "Weakness / Calcium deficiency",
    probFertility: "Repeat Breeding / Infertility",
    probMastitis: "Mastitis / Udder swelling",
    probDigestion: "Digestion / Appetite issue",
    probFat: "Low Fat / Low SNF",
    probOther: "Other Problem",
    otherProblemPlaceholder: "Describe specific problem...",

    // Q8
    q8Title: "8. Breeds category",
    q8Sub: "Breeds category",
    breedGir: "Gir Cow",
    breedKankrej: "Kankrej Cow",
    breedHF: "HF (Holstein)",
    breedJersey: "Jersey",
    breedMurrah: "Murrah Buffalo",
    breedJaffarabadi: "Jaffarabadi Buffalo",
    breedBanni: "Banni Buffalo",
    breedMehsani: "Mehsani Buffalo",
    breedDesi: "Desi / Local",
    otherBreedPlaceholder: "Other breed...",

    // Q9
    q9Title: "9. Any issues faced with other products?",
    q9Sub: "Customers ne Bija product ma issues ave che",
    otherProductIssuesPlaceholder: "Describe which product and what issue...",
  },
  gu: {
    headerTitle: "ગ્રાહક પ્રશ્નાવલી (પશુપાલન માહિતી)",
    headerSubtitle: "પશુપાલક પ્રોફાઇલ અને પ્રોડક્ટ પ્રતિસાદ એકત્રિત કરો",
    togglePrompt: "ભાષા પસંદ કરો:",

    // Q1
    q1Title: "૧. પશુપાલક છે કે નહીં?",
    q1Sub: "Pashu palak che ke nai",
    yes: "હા (પશુપાલક છે)",
    no: "ના (પશુપાલક નથી)",

    // Q2
    q2Title: "૨. પશુપાલનમાં કેટલા વર્ષનો અનુભવ છે?",
    q2Sub: "Years of experience",
    expYearsPlaceholder: "દા.ત. ૫ વર્ષ",

    // Q3
    q3Title: "૩. કુલ કેટલા પશુઓ છે?",
    q3Sub: "How many animals in total?",
    totalAnimalsPlaceholder: "કુલ સંખ્યા",

    // Q4
    q4Title: "૪. પશુઓની વિગત અને વર્ગીકરણ",
    q4Sub: "મોટા / નાના / ગાય / ભેંસ / દૂધ આપતા / ન આપતા / ગાભણ / ખાલી",
    cows: "ગાય",
    buffaloes: "ભેંસ",
    bigAnimals: "મોટા પશુઓ (પુખ્ત)",
    smallAnimals: "નાના પશુઓ (વાછરડાં)",
    milking: "દૂધ આપતા",
    nonMilking: "દૂધ ન આપતા (સૂકા)",
    pregnant: "ગાભણ",
    nonPregnant: "ખાલી (બિન-ગાભણ)",

    // Q5
    q5Title: "૫. કેલ્શિયમ કે કોઈ લિક્વિડ ફીડ સપ્લિમેન્ટ આપ્યું છે?",
    q5Sub: "Calcium or liquid feed supplement apiyu che?",

    // Q6
    q6Title: "૬. કઈ કંપનીનું કેલ્શિયમ વાપર્યું છે?",
    q6Sub: "Which company have you used calcium?",
    calciumCompanyPlaceholder: "દા.ત. પારૂલ કેમિકલ્સ (કેલ્સિવાલ), ઇન્ટાસ, વિરબેક...",

    // Q7
    q7Title: "૭. પશુઓમાં શું તકલીફ / સમસ્યાઓ છે?",
    q7Sub: "Problems of those animals",
    probMilkDrop: "દૂધ ઘટી જવું",
    probWeakness: "નબળાઈ / કેલ્શિયમની ઉણપ",
    probFertility: "વારંવાર ઉથલાવવું (ગર્ભ ન રહેવો)",
    probMastitis: "આઉનો સોજો / મસ્ટાઈટિસ",
    probDigestion: "પાચન / ખાવામાં અરુચિ",
    probFat: "ફેટ / SNF ઓછા આવવા",
    probOther: "અન્ય સમસ્યા",
    otherProblemPlaceholder: "સમસ્યાની વિગત લખો...",

    // Q8
    q8Title: "૮. પશુઓની નસલ / બ્રીડ કેટેગરી",
    q8Sub: "Breeds category",
    breedGir: "ગીર ગાય",
    breedKankrej: "કાંકરેજ ગાય",
    breedHF: "એચ.એફ (HF)",
    breedJersey: "જર્સી",
    breedMurrah: "મુર્રાહ ભેંસ",
    breedJaffarabadi: "જાફરાબાદી ભેંસ",
    breedBanni: "બન્ની ભેંસ",
    breedMehsani: "મહેસાણી ભેંસ",
    breedDesi: "દેશી પશુ",
    otherBreedPlaceholder: "અન્ય નસલ...",

    // Q9
    q9Title: "૯. ગ્રાહકને અન્ય કોઈ પ્રોડક્ટમાં મુશ્કેલી / ફરિયાદ છે?",
    q9Sub: "Customers ne Bija product ma issues ave che",
    otherProductIssuesPlaceholder: "કઈ પ્રોડક્ટ અને શું સમસ્યા છે તે લખો...",
  },
  hi: {
    headerTitle: "ग्राहक प्रश्नावली (पशुपालन विवरण)",
    headerSubtitle: "पशुपालक प्रोफ़ाइल और उत्पाद प्रतिक्रिया एकत्र करें",
    togglePrompt: "भाषा चुनें:",

    // Q1
    q1Title: "१. क्या ग्राहक पशुपालक हैं?",
    q1Sub: "Pashu palak che ke nai",
    yes: "हाँ (पशुपालक हैं)",
    no: "नहीं (पशुपालक नहीं हैं)",

    // Q2
    q2Title: "२. पशुपालन में कितने वर्षों का अनुभव है?",
    q2Sub: "Years of experience",
    expYearsPlaceholder: "उदा. ५ वर्ष",

    // Q3
    q3Title: "३. कुल कितने पशु हैं?",
    q3Sub: "How many animals in total?",
    totalAnimalsPlaceholder: "कुल संख्या",

    // Q4
    q4Title: "४. पशुओं का विवरण और वर्गीकरण",
    q4Sub: "बड़े / छोटे / गाय / भैंस / दुधारू / बिना दूध / गाभिन / खाली",
    cows: "गाय",
    buffaloes: "भैंस",
    bigAnimals: "बड़े पशु (वयस्क)",
    smallAnimals: "छोटे पशु (बछड़े)",
    milking: "दुधारू (दूध देने वाले)",
    nonMilking: "बिना दूध (सूखे)",
    pregnant: "गाभिन (गर्भवती)",
    nonPregnant: "खाली (गैर-गर्भवती)",

    // Q5
    q5Title: "५. क्या कैल्शियम या कोई लिक्विड फीड सप्लीमेंट दिया है?",
    q5Sub: "Calcium or liquid feed supplement apiyu che?",

    // Q6
    q6Title: "६. किस कंपनी का कैल्शियम इस्तेमाल किया है?",
    q6Sub: "Which company have you used calcium?",
    calciumCompanyPlaceholder: "उदा. पारुल केमिकल्स (कैल्सिवल), इंटास, विरबैक...",

    // Q7
    q7Title: "७. पशुओं में क्या समस्याएँ / बीमारियाँ हैं?",
    q7Sub: "Problems of those animals",
    probMilkDrop: "दूध कम होना",
    probWeakness: "कमजोरी / कैल्शियम की कमी",
    probFertility: "बार-बार फिरना (गर्भ न ठहरना)",
    probMastitis: "थन की सूजन / मस्टाइटिस",
    probDigestion: "पाचन / भूख न लगना",
    probFat: "फैट / SNF कम होना",
    probOther: "अन्य समस्या",
    otherProblemPlaceholder: "समस्या का विवरण लिखें...",

    // Q8
    q8Title: "८. पशुओं की नस्ल / ब्रीड कैटेगरी",
    q8Sub: "Breeds category",
    breedGir: "गीर गाय",
    breedKankrej: "कांक्रेज गाय",
    breedHF: "एच.एफ (HF)",
    breedJersey: "जर्सी",
    breedMurrah: "मुर्राह भैंस",
    breedJaffarabadi: "जाफराबादी भैंस",
    breedBanni: "बन्नी भैंस",
    breedMehsani: "मेहसाणी भैंस",
    breedDesi: "देशी पशु",
    otherBreedPlaceholder: "अन्य नस्ल...",

    // Q9
    q9Title: "९. क्या ग्राहक को किसी अन्य उत्पाद में समस्या आ रही है?",
    q9Sub: "Customers ne Bija product ma issues ave che",
    otherProductIssuesPlaceholder: "किस उत्पाद में क्या समस्या है विवरण लिखें...",
  },
};

// Common brand recommendations for quick chips
const COMMON_BRANDS = [
  "Parul Chemicals (Calcival)",
  "Virbac (Ostovet)",
  "Intas (Calup)",
  "Cargill",
  "Himalaya (HimCal)",
  "Other",
];

// Experience shortcuts
const EXP_SHORTCUTS = ["< 1 Yr", "1-3 Yrs", "3-5 Yrs", "5-10 Yrs", "10+ Yrs"];

export interface TelecallerQuestionnaireProps {
  data: QuestionnaireData;
  onChange: (data: QuestionnaireData) => void;
  defaultExpanded?: boolean;
}

export const TelecallerQuestionnaire: React.FC<TelecallerQuestionnaireProps> = ({
  data,
  onChange,
  defaultExpanded = true,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const { language: storeLang } = useLanguageStore();

  // Active language for the questionnaire: default to store language if valid, else 'gu' (most common for farmers) or 'en'
  const [lang, setLang] = useState<QuestionnaireLang>(
    storeLang === "gu" || storeLang === "hi" || storeLang === "en" ? (storeLang as QuestionnaireLang) : "gu"
  );
  const [expanded, setExpanded] = useState<boolean>(defaultExpanded);

  const t = T[lang] || T.en;

  const updateField = <K extends keyof QuestionnaireData>(field: K, value: QuestionnaireData[K]) => {
    onChange({
      ...data,
      [field]: value,
    });
  };

  const toggleProblem = (key: string) => {
    const list = data.animalProblems || [];
    if (list.includes(key)) {
      updateField("animalProblems", list.filter((p) => p !== key));
    } else {
      updateField("animalProblems", [...list, key]);
    }
  };

  const toggleBreed = (key: string) => {
    const list = data.breedCategories || [];
    if (list.includes(key)) {
      updateField("breedCategories", list.filter((b) => b !== key));
    } else {
      updateField("breedCategories", [...list, key]);
    }
  };

  // Helper count of filled questions to show completion badge
  const filledCount = [
    data.isPashupalak,
    data.yearsExperience,
    data.totalAnimals,
    data.cowsCount || data.buffaloesCount || data.milkingCount,
    data.hasGivenCalcium,
    data.calciumCompany,
    data.animalProblems.length > 0,
    data.breedCategories.length > 0,
    data.hasOtherProductIssues,
  ].filter(Boolean).length;

  const border = theme.palette.divider;
  const surface = isDark ? "rgba(255,255,255,0.03)" : "#f8fafc";
  const activeColor = theme.palette.primary.main;

  return (
    <Paper
      elevation={0}
      sx={{
        mt: 2,
        mb: 2,
        borderRadius: 2.5,
        border: `1.5px solid ${alpha(theme.palette.primary.main, 0.25)}`,
        bgcolor: isDark ? alpha(theme.palette.background.paper, 0.7) : "#ffffff",
        overflow: "hidden",
        boxShadow: isDark ? "0 4px 20px rgba(0,0,0,0.3)" : "0 4px 16px rgba(99,102,241,0.06)",
      }}
    >
      {/* ── Header with Language Toggle & Collapse Button ── */}
      <Box
        sx={{
          px: 2,
          py: 1.5,
          bgcolor: alpha(theme.palette.primary.main, 0.08),
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 1,
          borderBottom: `1px solid ${alpha(theme.palette.primary.main, 0.15)}`,
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1} sx={{ cursor: "pointer" }} onClick={() => setExpanded(!expanded)}>
          <AssignmentTurnedInIcon color="primary" sx={{ fontSize: 22 }} />
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, lineHeight: 1.2, color: "text.primary" }}>
              {t.headerTitle}
            </Typography>
            <Typography variant="caption" sx={{ color: "text.secondary", fontSize: "0.7rem" }}>
              {t.headerSubtitle} {filledCount > 0 && `• (${filledCount}/9 answered)`}
            </Typography>
          </Box>
        </Stack>

        <Stack direction="row" alignItems="center" spacing={1}>
          {/* Language Switcher Tabs */}
          <ButtonGroup size="small" variant="outlined" sx={{ bgcolor: isDark ? "rgba(0,0,0,0.3)" : "#ffffff", borderRadius: 2 }}>
            <Button
              onClick={() => setLang("gu")}
              variant={lang === "gu" ? "contained" : "outlined"}
              sx={{ px: 1, py: 0.2, fontSize: "0.72rem", fontWeight: 700, textTransform: "none" }}
            >
              ગુજરાતી
            </Button>
            <Button
              onClick={() => setLang("en")}
              variant={lang === "en" ? "contained" : "outlined"}
              sx={{ px: 1, py: 0.2, fontSize: "0.72rem", fontWeight: 700, textTransform: "none" }}
            >
              English
            </Button>
            <Button
              onClick={() => setLang("hi")}
              variant={lang === "hi" ? "contained" : "outlined"}
              sx={{ px: 1, py: 0.2, fontSize: "0.72rem", fontWeight: 700, textTransform: "none" }}
            >
              हिंदी
            </Button>
          </ButtonGroup>

          <IconButton size="small" onClick={() => setExpanded(!expanded)}>
            {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
          </IconButton>
        </Stack>
      </Box>

      {/* ── Collapsible Body with All Questions ── */}
      <Collapse in={expanded}>
        <Box sx={{ p: 2 }}>
          {/* ── Q1: Pashupalak che ke nai? ── */}
          <Box sx={{ mb: 2.5, p: 1.5, borderRadius: 2, bgcolor: surface, border: `1px solid ${border}` }}>
            <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5, color: "text.primary" }}>
              {t.q1Title}
            </Typography>
            <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 1, fontStyle: "italic" }}>
              "{t.q1Sub}"
            </Typography>
            <Stack direction="row" spacing={1.5}>
              <Button
                size="small"
                variant={data.isPashupalak === "yes" ? "contained" : "outlined"}
                color="success"
                onClick={() => updateField("isPashupalak", "yes")}
                sx={{ borderRadius: 2, textTransform: "none", fontWeight: 600, px: 2.5 }}
              >
                {t.yes}
              </Button>
              <Button
                size="small"
                variant={data.isPashupalak === "no" ? "contained" : "outlined"}
                color="error"
                onClick={() => updateField("isPashupalak", "no")}
                sx={{ borderRadius: 2, textTransform: "none", fontWeight: 600, px: 2.5 }}
              >
                {t.no}
              </Button>
            </Stack>
          </Box>

          {/* ── Q2 & Q3: Years of Experience & Total Animals ── */}
          <Grid container spacing={2} sx={{ mb: 2.5 }}>
            <Grid item xs={12} sm={6}>
              <Box sx={{ p: 1.5, height: "100%", borderRadius: 2, bgcolor: surface, border: `1px solid ${border}` }}>
                <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5, color: "text.primary" }}>
                  {t.q2Title}
                </Typography>
                <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 1, fontStyle: "italic" }}>
                  "{t.q2Sub}"
                </Typography>
                <Stack direction="row" flexWrap="wrap" gap={0.5} sx={{ mb: 1 }}>
                  {EXP_SHORTCUTS.map((exp) => (
                    <Chip
                      key={exp}
                      label={exp}
                      size="small"
                      clickable
                      color={data.yearsExperience === exp ? "primary" : "default"}
                      variant={data.yearsExperience === exp ? "filled" : "outlined"}
                      onClick={() => updateField("yearsExperience", exp)}
                      sx={{ fontSize: "0.7rem", height: 24, fontWeight: 600 }}
                    />
                  ))}
                </Stack>
                <TextField
                  size="small"
                  fullWidth
                  placeholder={t.expYearsPlaceholder}
                  value={data.yearsExperience}
                  onChange={(e) => updateField("yearsExperience", e.target.value)}
                  sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                />
              </Box>
            </Grid>

            <Grid item xs={12} sm={6}>
              <Box sx={{ p: 1.5, height: "100%", borderRadius: 2, bgcolor: surface, border: `1px solid ${border}` }}>
                <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5, color: "text.primary" }}>
                  {t.q3Title}
                </Typography>
                <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 1, fontStyle: "italic" }}>
                  "{t.q3Sub}"
                </Typography>
                <TextField
                  type="number"
                  size="small"
                  fullWidth
                  placeholder={t.totalAnimalsPlaceholder}
                  value={data.totalAnimals}
                  onChange={(e) => updateField("totalAnimals", e.target.value)}
                  inputProps={{ min: 0 }}
                  sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                />
              </Box>
            </Grid>
          </Grid>

          {/* ── Q4: Animal Breakdown (Cow / Buffalo / Big / Small / Milking / Not Milking / Pregnant / Non-Pregnant) ── */}
          <Box sx={{ mb: 2.5, p: 1.5, borderRadius: 2, bgcolor: surface, border: `1px solid ${border}` }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
              <PetsIcon color="primary" sx={{ fontSize: 18 }} />
              <Typography variant="body2" sx={{ fontWeight: 700, color: "text.primary" }}>
                {t.q4Title}
              </Typography>
            </Stack>
            <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 1.5, fontStyle: "italic" }}>
              "{t.q4Sub}"
            </Typography>

            <Grid container spacing={1.5}>
              {[
                { label: t.cows, field: "cowsCount" as const, placeholder: "0" },
                { label: t.buffaloes, field: "buffaloesCount" as const, placeholder: "0" },
                { label: t.bigAnimals, field: "bigAnimalsCount" as const, placeholder: "0" },
                { label: t.smallAnimals, field: "smallAnimalsCount" as const, placeholder: "0" },
                { label: t.milking, field: "milkingCount" as const, placeholder: "0" },
                { label: t.nonMilking, field: "nonMilkingCount" as const, placeholder: "0" },
                { label: t.pregnant, field: "pregnantCount" as const, placeholder: "0" },
                { label: t.nonPregnant, field: "nonPregnantCount" as const, placeholder: "0" },
              ].map((item) => (
                <Grid item xs={6} sm={3} key={item.field}>
                  <Box sx={{ p: 1, bgcolor: isDark ? "rgba(255,255,255,0.02)" : "#ffffff", borderRadius: 2, border: `1px solid ${border}` }}>
                    <Typography variant="caption" sx={{ fontWeight: 600, display: "block", mb: 0.5, color: "text.secondary" }}>
                      {item.label}
                    </Typography>
                    <TextField
                      type="number"
                      size="small"
                      fullWidth
                      placeholder={item.placeholder}
                      value={data[item.field]}
                      onChange={(e) => updateField(item.field, e.target.value)}
                      inputProps={{ min: 0 }}
                      sx={{ "& .MuiOutlinedInput-root": { borderRadius: 1.5, height: 32, fontSize: "0.85rem" } }}
                    />
                  </Box>
                </Grid>
              ))}
            </Grid>
          </Box>

          {/* ── Q5 & Q6: Calcium / Liquid Feed Supplements & Company ── */}
          <Grid container spacing={2} sx={{ mb: 2.5 }}>
            <Grid item xs={12} sm={6}>
              <Box sx={{ p: 1.5, height: "100%", borderRadius: 2, bgcolor: surface, border: `1px solid ${border}` }}>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                  <MedicalServicesIcon color="secondary" sx={{ fontSize: 18 }} />
                  <Typography variant="body2" sx={{ fontWeight: 700, color: "text.primary" }}>
                    {t.q5Title}
                  </Typography>
                </Stack>
                <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 1.5, fontStyle: "italic" }}>
                  "{t.q5Sub}"
                </Typography>
                <Stack direction="row" spacing={1.5}>
                  <Button
                    size="small"
                    variant={data.hasGivenCalcium === "yes" ? "contained" : "outlined"}
                    color="primary"
                    onClick={() => updateField("hasGivenCalcium", "yes")}
                    sx={{ borderRadius: 2, textTransform: "none", fontWeight: 600, px: 2.5 }}
                  >
                    {t.yes}
                  </Button>
                  <Button
                    size="small"
                    variant={data.hasGivenCalcium === "no" ? "contained" : "outlined"}
                    color="inherit"
                    onClick={() => updateField("hasGivenCalcium", "no")}
                    sx={{ borderRadius: 2, textTransform: "none", fontWeight: 600, px: 2.5 }}
                  >
                    {t.no}
                  </Button>
                </Stack>
              </Box>
            </Grid>

            <Grid item xs={12} sm={6}>
              <Box sx={{ p: 1.5, height: "100%", borderRadius: 2, bgcolor: surface, border: `1px solid ${border}` }}>
                <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5, color: "text.primary" }}>
                  {t.q6Title}
                </Typography>
                <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 1, fontStyle: "italic" }}>
                  "{t.q6Sub}"
                </Typography>
                <Stack direction="row" flexWrap="wrap" gap={0.5} sx={{ mb: 1 }}>
                  {COMMON_BRANDS.map((brand) => (
                    <Chip
                      key={brand}
                      label={brand}
                      size="small"
                      clickable
                      color={data.calciumCompany === brand ? "primary" : "default"}
                      variant={data.calciumCompany === brand ? "filled" : "outlined"}
                      onClick={() => updateField("calciumCompany", brand)}
                      sx={{ fontSize: "0.68rem", height: 22, fontWeight: 500 }}
                    />
                  ))}
                </Stack>
                <TextField
                  size="small"
                  fullWidth
                  placeholder={t.calciumCompanyPlaceholder}
                  value={data.calciumCompany}
                  onChange={(e) => updateField("calciumCompany", e.target.value)}
                  sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                />
              </Box>
            </Grid>
          </Grid>

          {/* ── Q7: Problems of Those Animals ── */}
          <Box sx={{ mb: 2.5, p: 1.5, borderRadius: 2, bgcolor: surface, border: `1px solid ${border}` }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
              <ReportProblemIcon color="warning" sx={{ fontSize: 18 }} />
              <Typography variant="body2" sx={{ fontWeight: 700, color: "text.primary" }}>
                {t.q7Title}
              </Typography>
            </Stack>
            <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 1, fontStyle: "italic" }}>
              "{t.q7Sub}"
            </Typography>

            <Stack direction="row" flexWrap="wrap" gap={0.8} sx={{ mb: 1.5 }}>
              {[
                { key: "milk_drop", label: t.probMilkDrop },
                { key: "weakness", label: t.probWeakness },
                { key: "repeat_breeding", label: t.probFertility },
                { key: "mastitis", label: t.probMastitis },
                { key: "digestion", label: t.probDigestion },
                { key: "low_fat", label: t.probFat },
                { key: "other", label: t.probOther },
              ].map((item) => {
                const isSelected = (data.animalProblems || []).includes(item.key);
                return (
                  <Chip
                    key={item.key}
                    label={item.label}
                    size="small"
                    clickable
                    color={isSelected ? "warning" : "default"}
                    variant={isSelected ? "filled" : "outlined"}
                    onClick={() => toggleProblem(item.key)}
                    icon={isSelected ? <CheckCircleIcon sx={{ fontSize: 16 }} /> : undefined}
                    sx={{
                      fontSize: "0.75rem",
                      height: 28,
                      fontWeight: 600,
                      borderRadius: 2,
                    }}
                  />
                );
              })}
            </Stack>

            <TextField
              size="small"
              fullWidth
              placeholder={t.otherProblemPlaceholder}
              value={data.otherProblemDetails}
              onChange={(e) => updateField("otherProblemDetails", e.target.value)}
              sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
            />
          </Box>

          {/* ── Q8: Breeds Category ── */}
          <Box sx={{ mb: 2.5, p: 1.5, borderRadius: 2, bgcolor: surface, border: `1px solid ${border}` }}>
            <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5, color: "text.primary" }}>
              {t.q8Title}
            </Typography>
            <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 1, fontStyle: "italic" }}>
              "{t.q8Sub}"
            </Typography>

            <Stack direction="row" flexWrap="wrap" gap={0.8} sx={{ mb: 1.5 }}>
              {[
                { key: "Gir", label: t.breedGir },
                { key: "Kankrej", label: t.breedKankrej },
                { key: "HF", label: t.breedHF },
                { key: "Jersey", label: t.breedJersey },
                { key: "Murrah", label: t.breedMurrah },
                { key: "Jaffarabadi", label: t.breedJaffarabadi },
                { key: "Banni", label: t.breedBanni },
                { key: "Mehsani", label: t.breedMehsani },
                { key: "Desi", label: t.breedDesi },
              ].map((item) => {
                const isSelected = (data.breedCategories || []).includes(item.key);
                return (
                  <Chip
                    key={item.key}
                    label={item.label}
                    size="small"
                    clickable
                    color={isSelected ? "info" : "default"}
                    variant={isSelected ? "filled" : "outlined"}
                    onClick={() => toggleBreed(item.key)}
                    icon={isSelected ? <CheckCircleIcon sx={{ fontSize: 16 }} /> : undefined}
                    sx={{
                      fontSize: "0.75rem",
                      height: 28,
                      fontWeight: 600,
                      borderRadius: 2,
                    }}
                  />
                );
              })}
            </Stack>

            <TextField
              size="small"
              fullWidth
              placeholder={t.otherBreedPlaceholder}
              value={data.otherBreedDetails}
              onChange={(e) => updateField("otherBreedDetails", e.target.value)}
              sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
            />
          </Box>

          {/* ── Q9: Customers ne Bija product ma issues ave che ── */}
          <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: surface, border: `1px solid ${border}` }}>
            <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5, color: "text.primary" }}>
              {t.q9Title}
            </Typography>
            <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 1.5, fontStyle: "italic" }}>
              "{t.q9Sub}"
            </Typography>

            <Stack direction="row" spacing={1.5} sx={{ mb: data.hasOtherProductIssues === "yes" ? 1.5 : 0 }}>
              <Button
                size="small"
                variant={data.hasOtherProductIssues === "yes" ? "contained" : "outlined"}
                color="error"
                onClick={() => updateField("hasOtherProductIssues", "yes")}
                sx={{ borderRadius: 2, textTransform: "none", fontWeight: 600, px: 2.5 }}
              >
                {t.yes}
              </Button>
              <Button
                size="small"
                variant={data.hasOtherProductIssues === "no" ? "contained" : "outlined"}
                color="success"
                onClick={() => updateField("hasOtherProductIssues", "no")}
                sx={{ borderRadius: 2, textTransform: "none", fontWeight: 600, px: 2.5 }}
              >
                {t.no}
              </Button>
            </Stack>

            {data.hasOtherProductIssues === "yes" && (
              <TextField
                size="small"
                fullWidth
                multiline
                rows={2}
                placeholder={t.otherProductIssuesPlaceholder}
                value={data.otherProductIssuesDetails}
                onChange={(e) => updateField("otherProductIssuesDetails", e.target.value)}
                sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
              />
            )}
          </Box>
        </Box>
      </Collapse>
    </Paper>
  );
};

/**
 * Format questionnaire data into clean markdown notes for call logs
 */
export function formatQuestionnaireNotes(q: QuestionnaireData): string {
  const parts: string[] = [];

  if (q.isPashupalak) {
    parts.push(`Pashupalak: ${q.isPashupalak === "yes" ? "Yes" : "No"}`);
  }
  if (q.yearsExperience) {
    parts.push(`Exp: ${q.yearsExperience}`);
  }
  if (q.totalAnimals) {
    parts.push(`Total Animals: ${q.totalAnimals}`);
  }

  const breakdown: string[] = [];
  if (q.cowsCount) breakdown.push(`Cows: ${q.cowsCount}`);
  if (q.buffaloesCount) breakdown.push(`Buffaloes: ${q.buffaloesCount}`);
  if (q.bigAnimalsCount) breakdown.push(`Big: ${q.bigAnimalsCount}`);
  if (q.smallAnimalsCount) breakdown.push(`Small: ${q.smallAnimalsCount}`);
  if (q.milkingCount) breakdown.push(`Milking: ${q.milkingCount}`);
  if (q.nonMilkingCount) breakdown.push(`Dry: ${q.nonMilkingCount}`);
  if (q.pregnantCount) breakdown.push(`Pregnant: ${q.pregnantCount}`);
  if (q.nonPregnantCount) breakdown.push(`Open: ${q.nonPregnantCount}`);
  if (breakdown.length > 0) {
    parts.push(`[Breakdown: ${breakdown.join(", ")}]`);
  }

  if (q.breedCategories && q.breedCategories.length > 0) {
    const breeds = [...q.breedCategories];
    if (q.otherBreedDetails) breeds.push(q.otherBreedDetails);
    parts.push(`Breeds: ${breeds.join(", ")}`);
  } else if (q.otherBreedDetails) {
    parts.push(`Breeds: ${q.otherBreedDetails}`);
  }

  if (q.hasGivenCalcium) {
    let calStr = `Calcium Given: ${q.hasGivenCalcium === "yes" ? "Yes" : "No"}`;
    if (q.calciumCompany) calStr += ` (${q.calciumCompany})`;
    parts.push(calStr);
  }

  if (q.animalProblems && q.animalProblems.length > 0) {
    const problems = [...q.animalProblems];
    if (q.otherProblemDetails) problems.push(q.otherProblemDetails);
    parts.push(`Problems: ${problems.join(", ")}`);
  } else if (q.otherProblemDetails) {
    parts.push(`Problems: ${q.otherProblemDetails}`);
  }

  if (q.hasOtherProductIssues) {
    let issueStr = `Other Product Issues: ${q.hasOtherProductIssues === "yes" ? "Yes" : "No"}`;
    if (q.otherProductIssuesDetails) issueStr += ` (${q.otherProductIssuesDetails})`;
    parts.push(issueStr);
  }

  if (parts.length === 0) return "";
  return `[Questionnaire Answers] ${parts.join(" | ")}`;
}

/**
 * Check if the questionnaire has at least one answer entered
 */
export function hasQuestionnaireData(q?: QuestionnaireData): boolean {
  if (!q) return false;
  return Boolean(
    q.isPashupalak ||
    q.yearsExperience ||
    q.totalAnimals ||
    q.cowsCount ||
    q.buffaloesCount ||
    q.bigAnimalsCount ||
    q.smallAnimalsCount ||
    q.milkingCount ||
    q.nonMilkingCount ||
    q.pregnantCount ||
    q.nonPregnantCount ||
    q.hasGivenCalcium ||
    q.calciumCompany ||
    (q.animalProblems && q.animalProblems.length > 0) ||
    q.otherProblemDetails ||
    (q.breedCategories && q.breedCategories.length > 0) ||
    q.otherBreedDetails ||
    q.hasOtherProductIssues ||
    q.otherProductIssuesDetails
  );
}

/**
 * Format questionnaire data into a clean, typed JSON object for algorithms and DB
 */
export function cleanQuestionnaireData(q?: QuestionnaireData): Record<string, any> | null {
  if (!q || !hasQuestionnaireData(q)) return null;
  return {
    is_pashupalak: q.isPashupalak === "yes" ? true : q.isPashupalak === "no" ? false : null,
    years_experience: q.yearsExperience ? Number(q.yearsExperience) || q.yearsExperience : null,
    total_animals: q.totalAnimals ? Number(q.totalAnimals) || q.totalAnimals : null,
    breakdown: {
      cows: q.cowsCount ? Number(q.cowsCount) || q.cowsCount : null,
      buffaloes: q.buffaloesCount ? Number(q.buffaloesCount) || q.buffaloesCount : null,
      big: q.bigAnimalsCount ? Number(q.bigAnimalsCount) || q.bigAnimalsCount : null,
      small: q.smallAnimalsCount ? Number(q.smallAnimalsCount) || q.smallAnimalsCount : null,
      milking: q.milkingCount ? Number(q.milkingCount) || q.milkingCount : null,
      non_milking: q.nonMilkingCount ? Number(q.nonMilkingCount) || q.nonMilkingCount : null,
      pregnant: q.pregnantCount ? Number(q.pregnantCount) || q.pregnantCount : null,
      non_pregnant: q.nonPregnantCount ? Number(q.nonPregnantCount) || q.nonPregnantCount : null,
    },
    has_given_calcium: q.hasGivenCalcium === "yes" ? true : q.hasGivenCalcium === "no" ? false : null,
    calcium_company: q.calciumCompany || null,
    animal_problems: q.animalProblems || [],
    other_problem_details: q.otherProblemDetails || null,
    breed_categories: q.breedCategories || [],
    other_breed_details: q.otherBreedDetails || null,
    has_other_product_issues: q.hasOtherProductIssues === "yes" ? true : q.hasOtherProductIssues === "no" ? false : null,
    other_product_issues_details: q.otherProductIssuesDetails || null,
    updated_at: new Date().toISOString(),
  };
}

export default TelecallerQuestionnaire;
