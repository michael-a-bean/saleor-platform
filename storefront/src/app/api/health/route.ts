import { NextResponse } from "next/server";

/**
 * Health check endpoint for ECS container and ALB health checks.
 * Returns 200 OK with basic status information.
 */
export async function GET() {
	return NextResponse.json(
		{
			status: "healthy",
			service: "storefront",
			timestamp: new Date().toISOString(),
		},
		{ status: 200 },
	);
}
