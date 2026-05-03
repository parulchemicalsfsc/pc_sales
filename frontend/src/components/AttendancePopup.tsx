/**
 * AttendancePopup — DEPRECATED / NO-OP
 *
 * Telecaller self-attendance has been replaced by the admin/sales-manager
 * duty sheet flow (see DutySheetPopup.tsx).
 *
 * This component intentionally renders null for all roles.
 * It is kept in the codebase only to avoid import errors in Layout.tsx
 * during the transition; it can be fully deleted once Layout is updated.
 */

const AttendancePopup: React.FC = () => null;

export default AttendancePopup;
