import TelecallerReports from "./TelecallerReports";
import { useAuth } from "../../contexts/AuthContext";

export default function TelecallerMyReports() {
  const { user } = useAuth();
  return <TelecallerReports fixedEmail={user?.email} />;
}
