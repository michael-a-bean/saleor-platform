import { type Metadata } from "next";
import { ContactForm } from "./ContactForm";

export const metadata: Metadata = {
	title: "Contact Us",
	description: "Get in touch with our team for questions, support, or feedback.",
};

export default async function ContactPage(props: { params: Promise<{ channel: string }> }) {
	const params = await props.params;

	return (
		<div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
			<div className="text-center">
				<h1 className="text-3xl font-bold tracking-tight text-neutral-900 sm:text-4xl">
					Contact Us
				</h1>
				<p className="mt-4 text-lg text-neutral-600">
					Have a question or need help? We&apos;d love to hear from you.
				</p>
			</div>

			<div className="mt-12 grid gap-12 lg:grid-cols-2">
				{/* Contact Form */}
				<div>
					<h2 className="text-lg font-semibold text-neutral-900">Send us a message</h2>
					<p className="mt-2 text-sm text-neutral-600">
						Fill out the form below and we&apos;ll get back to you as soon as possible.
					</p>
					<ContactForm channel={params.channel} />
				</div>

				{/* Contact Info */}
				<div>
					<h2 className="text-lg font-semibold text-neutral-900">Other ways to reach us</h2>
					<dl className="mt-6 space-y-6">
						<div>
							<dt className="text-sm font-medium text-neutral-900">Email</dt>
							<dd className="mt-1 text-sm text-neutral-600">
								<a href="mailto:support@example.com" className="hover:text-neutral-900">
									support@example.com
								</a>
							</dd>
						</div>
						<div>
							<dt className="text-sm font-medium text-neutral-900">Phone</dt>
							<dd className="mt-1 text-sm text-neutral-600">
								<a href="tel:+1-555-555-5555" className="hover:text-neutral-900">
									+1 (555) 555-5555
								</a>
							</dd>
						</div>
						<div>
							<dt className="text-sm font-medium text-neutral-900">Address</dt>
							<dd className="mt-1 text-sm text-neutral-600">
								<address className="not-italic">
									123 Main Street
									<br />
									Suite 100
									<br />
									City, State 12345
								</address>
							</dd>
						</div>
						<div>
							<dt className="text-sm font-medium text-neutral-900">Business Hours</dt>
							<dd className="mt-1 text-sm text-neutral-600">
								<p>Monday - Friday: 9:00 AM - 6:00 PM</p>
								<p>Saturday: 10:00 AM - 4:00 PM</p>
								<p>Sunday: Closed</p>
							</dd>
						</div>
					</dl>
				</div>
			</div>
		</div>
	);
}
