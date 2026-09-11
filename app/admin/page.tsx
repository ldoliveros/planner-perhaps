import { redirect } from "next/navigation";
import { AIONIS_SEPTEMBER } from "@/lib/mock/aionis";

export default function AdminIndexPage() {
  redirect(`/admin/calendars/${AIONIS_SEPTEMBER.id}`);
}
