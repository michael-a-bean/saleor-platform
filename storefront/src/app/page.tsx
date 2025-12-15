import { redirect } from "next/navigation";
import { DefaultChannelSlug } from "@/app/config";

// Force dynamic rendering since redirect() is a dynamic function
export const dynamic = "force-dynamic";

export default function EmptyPage() {
	redirect(`/${DefaultChannelSlug}`);
}
