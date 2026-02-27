import { redirect } from "next/navigation";
import { DefaultChannelSlug } from "@/app/config";

// Fallback redirect — middleware rewrites "/" to the default channel before this
// runs, so this only fires if middleware is bypassed (e.g., static export).
export default function RootPage() {
	redirect(`/${DefaultChannelSlug}`);
}
