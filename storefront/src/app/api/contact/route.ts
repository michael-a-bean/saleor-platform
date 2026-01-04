import { NextResponse } from "next/server";

interface ContactFormData {
	name: string;
	email: string;
	subject: string;
	message: string;
	channel: string;
}

export async function POST(request: Request) {
	try {
		const data = (await request.json()) as ContactFormData;

		// Validate required fields
		if (!data.name || !data.email || !data.subject || !data.message) {
			return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
		}

		// Validate email format
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!emailRegex.test(data.email)) {
			return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
		}

		// In production, you would:
		// 1. Send an email notification (using SendGrid, Resend, etc.)
		// 2. Store in a database or CRM
		// 3. Create a support ticket
		//
		// Example with email:
		// await sendEmail({
		//   to: process.env.CONTACT_EMAIL,
		//   subject: `[${data.subject}] New contact from ${data.name}`,
		//   body: data.message,
		//   replyTo: data.email,
		// });

		// For now, just log the submission (visible in server logs)
		if (process.env.NODE_ENV === "development") {
			console.log("Contact form submission:", {
				name: data.name,
				email: data.email,
				subject: data.subject,
				message: data.message.substring(0, 100) + "...",
				timestamp: new Date().toISOString(),
			});
		}

		return NextResponse.json({ success: true });
	} catch {
		return NextResponse.json({ error: "Failed to process request" }, { status: 500 });
	}
}
