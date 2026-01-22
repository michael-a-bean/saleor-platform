"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Clock, Bell } from "lucide-react";

export default function ComingSoonPage() {
	const router = useRouter();

	return (
		<div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-16">
			<div className="text-center">
				{/* Icon */}
				<div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-brand-deep-purple/10">
					<Clock className="h-10 w-10 text-brand-deep-purple" />
				</div>

				{/* Heading */}
				<h1 className="font-display text-3xl font-bold text-neutral-900 sm:text-4xl">
					Coming Soon
				</h1>

				{/* Description */}
				<p className="mx-auto mt-4 max-w-md text-lg text-neutral-600">
					We&apos;re working on something exciting! This section will be available soon.
					Check back later for updates.
				</p>

				{/* Actions */}
				<div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
					{/* Take Me Back Button */}
					<button
						onClick={() => router.back()}
						className="inline-flex items-center gap-2 rounded-lg border border-neutral-300 bg-white px-6 py-3 font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
					>
						<ArrowLeft className="h-5 w-5" />
						Take Me Back
					</button>

					{/* Home Link */}
					<Link
						href="/"
						className="inline-flex items-center gap-2 rounded-lg bg-brand-deep-purple px-6 py-3 font-medium text-white transition-colors hover:bg-brand-bright-blue"
					>
						Go to Homepage
					</Link>
				</div>

				{/* Optional: Notification signup hint */}
				<div className="mt-12 rounded-lg border border-neutral-200 bg-neutral-50 p-6">
					<div className="flex items-center justify-center gap-2 text-neutral-600">
						<Bell className="h-5 w-5" />
						<span>Want to be notified when this launches?</span>
					</div>
					<p className="mt-2 text-sm text-neutral-500">
						Follow us on social media or check back soon!
					</p>
				</div>
			</div>
		</div>
	);
}
