"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Calendar, Users } from "lucide-react";

export default function EventsPage() {
	const router = useRouter();

	return (
		<div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-16">
			<div className="text-center">
				{/* Icon */}
				<div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-brand-deep-purple/10">
					<Calendar className="h-10 w-10 text-brand-deep-purple" />
				</div>

				{/* Heading */}
				<h1 className="font-display text-3xl font-bold text-neutral-900 sm:text-4xl">
					Events
				</h1>
				<p className="mt-2 text-xl font-medium text-brand-deep-purple">Coming Soon</p>

				{/* Description */}
				<p className="mx-auto mt-4 max-w-md text-lg text-neutral-600">
					Tournaments, prereleases, game nights, and community events!
					Our events calendar is coming soon.
				</p>

				{/* Event Types Preview */}
				<div className="mx-auto mt-8 grid max-w-lg grid-cols-2 gap-4">
					<div className="rounded-lg border border-neutral-200 bg-white p-4 text-left">
						<div className="flex items-center gap-2 text-brand-deep-purple">
							<Users className="h-5 w-5" />
							<span className="font-medium">Prereleases</span>
						</div>
						<p className="mt-1 text-sm text-neutral-500">
							Be first to play new sets
						</p>
					</div>
					<div className="rounded-lg border border-neutral-200 bg-white p-4 text-left">
						<div className="flex items-center gap-2 text-brand-deep-purple">
							<Calendar className="h-5 w-5" />
							<span className="font-medium">Game Nights</span>
						</div>
						<p className="mt-1 text-sm text-neutral-500">
							Weekly casual play
						</p>
					</div>
				</div>

				{/* Actions */}
				<div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
					<button
						onClick={() => router.back()}
						className="inline-flex items-center gap-2 rounded-lg border border-neutral-300 bg-white px-6 py-3 font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
					>
						<ArrowLeft className="h-5 w-5" />
						Take Me Back
					</button>
					<Link
						href="/"
						className="inline-flex items-center gap-2 rounded-lg bg-brand-deep-purple px-6 py-3 font-medium text-white transition-colors hover:bg-brand-bright-blue"
					>
						Go to Homepage
					</Link>
				</div>
			</div>
		</div>
	);
}
