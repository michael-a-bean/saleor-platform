export const dynamic = "force-dynamic";

import { Suspense } from "react";
import { Loader } from "@/ui/atoms/Loader";
import { LoginForm } from "@/ui/components/LoginForm";

interface PageProps {
	params: Promise<{ channel: string }>;
	searchParams: Promise<{ redirect?: string }>;
}

export default async function LoginPage({ params, searchParams }: PageProps) {
	const { channel } = await params;
	const { redirect } = await searchParams;
	const redirectTo = redirect || `/${channel}`;

	return (
		<Suspense fallback={<Loader />}>
			<section className="mx-auto max-w-7xl p-8">
				<LoginForm redirectTo={redirectTo} />
			</section>
		</Suspense>
	);
}
