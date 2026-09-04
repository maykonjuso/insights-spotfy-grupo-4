import type { Metadata } from "next";
import { PainelAdmin } from "@/components/apresentacao/PainelAdmin";

export const metadata: Metadata = {
  title: "Modo apresentação",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return <PainelAdmin />;
}
