/**
 * individualTimelinePdf.ts
 * ──────────────────────────────────────────────────────────────────────────
 * High-fidelity Field Officer Timeline PDF Generator.
 * Formatted identically to the Vikas Ghatage Biz Analyst Timeline Report.
 *
 * Includes:
 * - Date, Party Name, Check In Details, Check Out Details
 * - Check-in to Check-out Distance (in KM) and Time Spent
 * - Speed Breakdown (Walking/Idle minutes vs Motorcycle minutes)
 * - Custom Date Range filtering
 * - Official Parul Chemicals header & footer styling
 */

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface OfficerTimelineVisit {
  id: string;
  user_id: string;
  customer_id?: string | null;
  customer_name?: string | null;
  party_name?: string | null;
  checked_in_at: string;
  checked_out_at?: string | null;
  duration_minutes?: number | null;
  walking_minutes?: number | null;
  motorcycle_minutes?: number | null;
  checkin_lat?: number | null;
  checkin_lng?: number | null;
  checkin_location?: string | null;
  checkin_village_name?: string | null;
  checkout_lat?: number | null;
  checkout_lng?: number | null;
  checkout_location?: string | null;
  checkout_village_name?: string | null;
  distance_km?: number | null;
  notes?: string | null;
  customers?: {
    name: string;
    village?: string | null;
    taluka?: string | null;
    district?: string | null;
  } | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dp / 2) * Math.sin(dp / 2) +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function fmtBizDate(iso?: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const day = d.getDate();
    const months = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    const month = months[d.getMonth()];
    const yr = String(d.getFullYear()).slice(-2);
    return `${day} ${month} ${yr}`;
  } catch {
    return iso.slice(0, 10);
  }
}

function fmtBizTime(iso?: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, "0");
    const ampm = hours >= 12 ? "pm" : "am";
    hours = hours % 12;
    hours = hours ? hours : 12;
    const strHours = String(hours).padStart(2, "0");
    return `${strHours}:${minutes} ${ampm}`;
  } catch {
    return iso;
  }
}

function fmtBizDur(minutes?: number | null): string {
  if (!minutes || minutes <= 0) return "0m";
  if (minutes >= 60) {
    return `${(minutes / 60).toFixed(1)}h`;
  }
  return `${minutes}m`;
}

// ─── Main PDF Export Function ─────────────────────────────────────────────────

export async function exportOfficerTimelinePDF(params: {
  officerName: string;
  officerEmail?: string;
  officerRole?: string;
  dateRangeStr: string;
  visits: OfficerTimelineVisit[];
}): Promise<void> {
  const { officerName, officerEmail, dateRangeStr, visits } = params;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // 1. Header (Centered like Vikas Ghatage.PDF)
  doc.setTextColor(17, 24, 39);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("PARUL CHEMICALS", pageWidth / 2, 16, { align: "center" });

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(`${officerName}'s Timeline Report`, pageWidth / 2, 23, { align: "center" });

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 116, 139);
  doc.text(dateRangeStr, pageWidth / 2, 29, { align: "center" });

  // Compute total stats
  let totalMinutes = 0;
  let totalWalkMinutes = 0;
  let totalBikeMinutes = 0;
  let totalDistMeters = 0;

  visits.forEach((v) => {
    const dur = v.duration_minutes ?? 0;
    totalMinutes += dur;
    totalWalkMinutes += v.walking_minutes ?? dur;
    totalBikeMinutes += v.motorcycle_minutes ?? 0;

    let dist = v.distance_km ? v.distance_km * 1000 : 0;
    if (!dist && v.checkin_lat && v.checkin_lng && v.checkout_lat && v.checkout_lng) {
      dist = calculateDistanceMeters(
        v.checkin_lat,
        v.checkin_lng,
        v.checkout_lat,
        v.checkout_lng
      );
    }
    totalDistMeters += dist;
  });

  const totalDistKm = (totalDistMeters / 1000).toFixed(2);

  // 2. Summary KPI Banner
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(12, 33, pageWidth - 24, 11, 1.5, 1.5, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 41, 59);

  const summaryLeft = `Visits: ${visits.length}   |   Total Time: ${fmtBizDur(totalMinutes)}   |   Total In-Out Dist: ${totalDistKm} km`;
  const summaryRight = `Walking/Idle: ${fmtBizDur(totalWalkMinutes)}   |   Motorcycle: ${fmtBizDur(totalBikeMinutes)}`;
  doc.text(summaryLeft, 16, 40);
  doc.text(summaryRight, pageWidth - 16, 40, { align: "right" });

  // 3. Build Table Rows
  const tableBody = visits.map((v) => {
    const dateStr = fmtBizDate(v.checked_in_at);

    // Party Name
    const cust = v.customers;
    const partyName =
      v.party_name ||
      v.customer_name ||
      cust?.name ||
      `${officerName} ( F O )\n${cust?.village || "Gujarat"}`;

    // Check In Details
    const inTime = fmtBizTime(v.checked_in_at);
    const inLocParts = [
      v.checkin_village_name,
      v.checkin_location,
      cust?.village,
      cust?.taluka,
    ].filter(Boolean);
    const inLoc =
      inLocParts.length > 0
        ? inLocParts[0]
        : v.checkin_lat && v.checkin_lng
        ? `${v.checkin_lat.toFixed(4)}, ${v.checkin_lng.toFixed(4)}`
        : "";
    const checkInCell = inLoc ? `${inTime}\n${inLoc}` : inTime;

    // Check Out Details
    const outTime = v.checked_out_at ? fmtBizTime(v.checked_out_at) : "In Progress";
    const outLocParts = [
      v.checkout_village_name,
      v.checkout_location,
      cust?.village,
      cust?.taluka,
    ].filter(Boolean);
    const outLoc =
      outLocParts.length > 0
        ? outLocParts[0]
        : v.checkout_lat && v.checkout_lng
        ? `${v.checkout_lat.toFixed(4)}, ${v.checkout_lng.toFixed(4)}`
        : "";
    const checkOutCell = outLoc ? `${outTime}\n${outLoc}` : outTime;

    // Calculate In-to-Out Distance
    let distKmStr = "0.00 km";
    if (v.distance_km) {
      distKmStr = `${v.distance_km.toFixed(2)} km`;
    } else if (v.checkin_lat && v.checkin_lng && v.checkout_lat && v.checkout_lng) {
      const dMeters = calculateDistanceMeters(
        v.checkin_lat,
        v.checkin_lng,
        v.checkout_lat,
        v.checkout_lng
      );
      distKmStr = `${(dMeters / 1000).toFixed(2)} km`;
    }

    // Time Spent & Distance Breakdown
    const durMins = v.duration_minutes ?? 0;
    const durStr = fmtBizDur(durMins);
    const walkMins = v.walking_minutes ?? durMins;
    const motoMins = v.motorcycle_minutes ?? 0;

    const timeSpentCell = `${durStr} (${distKmStr})\nWalk: ${walkMins}m\nBike: ${motoMins}m`;

    // Comment / Notes
    const commentCell =
      v.notes ||
      (cust?.name ? `${cust.name}\n${cust.village || ""}` : "Verified Visit");

    return [
      dateStr,
      partyName,
      checkInCell,
      checkOutCell,
      timeSpentCell,
      commentCell,
    ];
  });

  autoTable(doc, {
    startY: 47,
    margin: { left: 12, right: 12 },
    head: [
      [
        "Date",
        "Party Name",
        "Check In Details",
        "Check Out Details",
        "Time & Dist",
        "Comment",
      ],
    ],
    body:
      tableBody.length > 0
        ? tableBody
        : [["—", "No visits recorded for this range", "—", "—", "—", "—"]],
    theme: "grid",
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [17, 24, 39],
      fontSize: 8,
      fontStyle: "bold",
      lineWidth: 0.2,
      lineColor: [180, 180, 180],
    },
    styles: {
      fontSize: 8,
      cellPadding: 2.5,
      overflow: "linebreak",
      textColor: [30, 41, 59],
      lineWidth: 0.2,
      lineColor: [210, 210, 210],
    },
    columnStyles: {
      0: { cellWidth: 18 },
      1: { cellWidth: 34, fontStyle: "bold" },
      2: { cellWidth: 42 },
      3: { cellWidth: 42 },
      4: { cellWidth: 26, fontStyle: "bold" },
      5: { cellWidth: "auto" },
    },
  });

  // Check footer fit
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let finalY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 8 : 180;

  if (finalY + 55 > pageHeight - 15) {
    doc.addPage();
    finalY = 18;
  }

  // 4. Footer (Exact Parul Chemicals format from Vikas Ghatage.PDF)
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(30, 41, 59);

  const footerLines = [
    "Regards,",
    "PARUL CHEMICALS",
    "F S CALCIVAL",
    "SURVEY NO.63/A PART-1,",
    "VILLAGE : PANCHDEVLA",
    "TAL.WAGHODIA,",
    "DIST: VDODARA-391510",
    "Phone no. : 9825917101",
    "Pin code : 391510",
    "E-Mail : parulchemicals2016@gmail.com",
    "Sent through Biz Analyst App",
    "https://bizanalyst.in",
  ];

  let footerY = finalY;
  for (let idx = 0; idx < footerLines.length; idx++) {
    const line = footerLines[idx];
    if (idx === 1) {
      doc.setFont("helvetica", "bold");
    } else {
      doc.setFont("helvetica", "normal");
    }
    if (idx >= 10) {
      doc.setTextColor(100, 116, 139);
    }
    doc.text(line, 14, footerY);
    footerY += 4.2;
  }

  // Page Numbers
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Page ${i} of ${totalPages}  ·  Parul Chemicals Confidential`,
      pageWidth / 2,
      pageHeight - 6,
      { align: "center" }
    );
  }

  const cleanName = officerName.replace(/\s+/g, "_").toLowerCase();
  doc.save(`${cleanName}_timeline_report.pdf`);
}
