import { getCurrentUser } from "@/lib/currentUser";
import { LoginForm } from "@/ui/components/LoginForm";
import { StatusBanner, type StatusMessage } from "@/ui/components/StatusBanner";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const loginMessages: Record<string, StatusMessage> = {
	registration_success: { type: "success", text: "Account created successfully! Please log in." },
	password_reset: { type: "success", text: "Password reset successfully. Please log in." },
	login_required: { type: "error", text: "Please log in to continue." },
};

export default async function LoginPage({
	params,
	searchParams,
}: {
	params: Promise<{ channel: string }>;
	searchParams: Promise<{ status?: string; redirectTo?: string }>;
}) {
	const { channel } = await params;
	const { status, redirectTo } = await searchParams;

	const user = await getCurrentUser();
	if (user) {
		redirect(`/${channel}/account`);
	}

	const message = status ? (loginMessages[status] ?? null) : null;

	return (
		<div className="mx-auto max-w-7xl p-8">
			<h1 className="text-center text-2xl font-bold tracking-tight text-neutral-900">Log In</h1>

			<StatusBanner message={message} />

			<LoginForm redirectTo={redirectTo || `/${channel}/account`} channel={channel} />
		</div>
	);
}
