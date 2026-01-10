import { redirect } from "next/navigation";
import { type ReactNode } from "react";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { executeGraphQL } from "@/lib/graphql";
import { CurrentUserDocument } from "@/gql/graphql";
import { StaffProvider } from "./StaffContext";

export const dynamic = "force-dynamic";

/**
 * Singles Builder Layout
 *
 * This layout protects the Singles Builder routes by checking if the
 * current user is a staff member. Non-staff users are redirected to
 * the unauthorized page.
 */
export default async function SinglesBuilderLayout({
	children,
}: {
	children: ReactNode;
}) {
	// Fetch current user with staff status
	let user = null;
	try {
		const { me } = await executeGraphQL(CurrentUserDocument, {
			cache: "no-cache",
		});
		user = me;
	} catch {
		// User not authenticated
		user = null;
	}

	// Redirect if not authenticated
	if (!user) {
		redirect("/webstore/login?redirect=/singles-builder/webstore");
	}

	// Redirect if not staff
	if (!user.isStaff) {
		redirect("/unauthorized");
	}

	return (
		<StaffProvider
			email={user.email}
			firstName={user.firstName ?? undefined}
			lastName={user.lastName ?? undefined}
		>
			<div className="min-h-screen bg-gray-50">
				<header className="border-b bg-white shadow-sm">
					<div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
						<div className="flex items-center gap-4">
							<h1 className="text-xl font-bold text-gray-900">Singles Builder</h1>
							<span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700">
								Staff Only
							</span>
						</div>
						<div className="flex items-center gap-4">
							<span className="text-sm text-gray-600">
								{user.firstName} {user.lastName}
							</span>
							<span className="text-sm text-gray-400">({user.email})</span>
						</div>
					</div>
				</header>
				<main>{children}</main>
				<ToastContainer
					position="bottom-right"
					autoClose={3000}
					hideProgressBar={false}
					newestOnTop
					closeOnClick
					pauseOnFocusLoss
					draggable
					pauseOnHover
					theme="light"
				/>
			</div>
		</StaffProvider>
	);
}
