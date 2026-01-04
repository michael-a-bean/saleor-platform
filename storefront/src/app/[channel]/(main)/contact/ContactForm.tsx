"use client";

import { useState, type FormEvent } from "react";

type FormStatus = "idle" | "submitting" | "success" | "error";

export function ContactForm({ channel }: { channel: string }) {
	const [status, setStatus] = useState<FormStatus>("idle");
	const [errorMessage, setErrorMessage] = useState("");

	const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		setStatus("submitting");
		setErrorMessage("");

		const formData = new FormData(e.currentTarget);
		const data = {
			name: formData.get("name") as string,
			email: formData.get("email") as string,
			subject: formData.get("subject") as string,
			message: formData.get("message") as string,
			channel,
		};

		try {
			const response = await fetch("/api/contact", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(data),
			});

			if (!response.ok) {
				throw new Error("Failed to send message");
			}

			setStatus("success");
			(e.target as HTMLFormElement).reset();
		} catch {
			setStatus("error");
			setErrorMessage("There was a problem sending your message. Please try again later.");
		}
	};

	if (status === "success") {
		return (
			<div className="mt-6 rounded-lg border border-green-200 bg-green-50 p-6">
				<div className="flex items-center gap-3">
					<svg
						className="h-6 w-6 text-green-600"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M5 13l4 4L19 7"
						/>
					</svg>
					<h3 className="font-medium text-green-900">Message sent!</h3>
				</div>
				<p className="mt-2 text-sm text-green-700">
					Thank you for contacting us. We&apos;ll get back to you as soon as possible.
				</p>
				<button
					onClick={() => setStatus("idle")}
					className="mt-4 text-sm font-medium text-green-700 hover:text-green-900"
				>
					Send another message
				</button>
			</div>
		);
	}

	return (
		<form onSubmit={handleSubmit} className="mt-6 space-y-6">
			{status === "error" && (
				<div className="rounded-lg border border-red-200 bg-red-50 p-4">
					<p className="text-sm text-red-700">{errorMessage}</p>
				</div>
			)}

			<div>
				<label htmlFor="name" className="block text-sm font-medium text-neutral-900">
					Name
				</label>
				<input
					type="text"
					id="name"
					name="name"
					required
					className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
				/>
			</div>

			<div>
				<label htmlFor="email" className="block text-sm font-medium text-neutral-900">
					Email
				</label>
				<input
					type="email"
					id="email"
					name="email"
					required
					className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
				/>
			</div>

			<div>
				<label htmlFor="subject" className="block text-sm font-medium text-neutral-900">
					Subject
				</label>
				<select
					id="subject"
					name="subject"
					required
					className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
				>
					<option value="">Select a topic...</option>
					<option value="order">Order Inquiry</option>
					<option value="product">Product Question</option>
					<option value="returns">Returns & Refunds</option>
					<option value="buylist">Buylist / Selling Cards</option>
					<option value="feedback">Feedback</option>
					<option value="other">Other</option>
				</select>
			</div>

			<div>
				<label htmlFor="message" className="block text-sm font-medium text-neutral-900">
					Message
				</label>
				<textarea
					id="message"
					name="message"
					rows={5}
					required
					className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
				/>
			</div>

			<button
				type="submit"
				disabled={status === "submitting"}
				className="w-full rounded-md bg-neutral-900 px-4 py-3 text-sm font-medium text-white hover:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-neutral-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
			>
				{status === "submitting" ? "Sending..." : "Send Message"}
			</button>
		</form>
	);
}
