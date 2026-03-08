import { CurrentUserDocument } from "@/gql/graphql";
import { executeGraphQL } from "@/lib/graphql";
import { getStoreCredit, getCreditHistory } from "@/lib/customer-api";
import { formatMoney } from "@/lib/utils";
import { LoginForm } from "@/ui/components/LoginForm";
import { LinkWithChannel } from "@/ui/atoms/LinkWithChannel";

export const dynamic = "force-dynamic";

function formatTransactionType(type: string): string {
	return type
		.replace(/_/g, " ")
		.toLowerCase()
		.replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(dateString: string): string {
	return new Date(dateString).toLocaleDateString("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

export default async function StoreCreditPage() {
	const { me: user } = await executeGraphQL(CurrentUserDocument, {
		cache: "no-cache",
	});

	if (!user) {
		return <LoginForm />;
	}

	const [credit, history] = await Promise.all([getStoreCredit(), getCreditHistory()]);

	const balance = credit?.balance ?? 0;
	const currency = credit?.currency ?? "USD";
	const transactions = history?.transactions ?? [];

	return (
		<div className="mx-auto max-w-7xl p-8">
			<div className="flex items-center justify-between">
				<h1 className="text-2xl font-bold tracking-tight text-neutral-900">Store Credit</h1>
				<LinkWithChannel
					href="/account"
					className="text-sm font-medium text-neutral-500 hover:text-neutral-700"
				>
					Back to Account
				</LinkWithChannel>
			</div>

			{/* Balance Card */}
			<div className="mt-8 rounded-lg border bg-white p-6">
				<p className="text-sm font-medium text-neutral-500">Current Balance</p>
				<p className="mt-2 text-4xl font-bold tracking-tight text-neutral-900">
					{formatMoney(balance, currency)}
				</p>
				{balance > 0 && (
					<p className="mt-1 text-sm text-green-600">
						Available to use on your next purchase
					</p>
				)}
			</div>

			{/* Transaction History */}
			<div className="mt-8 rounded-lg border bg-white">
				<div className="border-b px-6 py-4">
					<h2 className="text-lg font-semibold text-neutral-900">Transaction History</h2>
				</div>

				{transactions.length === 0 ? (
					<div className="px-6 py-12 text-center">
						<p className="text-sm text-neutral-500">No transactions yet.</p>
						<p className="mt-1 text-sm text-neutral-400">
							Store credit from buylists and returns will appear here.
						</p>
					</div>
				) : (
					<>
						{/* Desktop Table */}
						<div className="hidden md:block">
							<table className="w-full">
								<thead>
									<tr className="border-b text-left text-sm font-medium text-neutral-500">
										<th className="px-6 py-3">Date</th>
										<th className="px-6 py-3">Type</th>
										<th className="px-6 py-3 text-right">Amount</th>
										<th className="px-6 py-3 text-right">Balance After</th>
										<th className="px-6 py-3">Note</th>
									</tr>
								</thead>
								<tbody className="divide-y">
									{transactions.map((tx) => (
										<tr key={tx.id} className="text-sm">
											<td className="px-6 py-3 text-neutral-600">
												{formatDate(tx.createdAt)}
											</td>
											<td className="px-6 py-3 text-neutral-900">
												{formatTransactionType(tx.type)}
											</td>
											<td
												className={`px-6 py-3 text-right font-medium ${
													tx.amount >= 0 ? "text-green-600" : "text-red-600"
												}`}
											>
												{tx.amount >= 0 ? "+" : ""}
												{formatMoney(Math.abs(tx.amount), currency)}
											</td>
											<td className="px-6 py-3 text-right text-neutral-600">
												{formatMoney(tx.balanceAfter, currency)}
											</td>
											<td className="px-6 py-3 text-neutral-500">
												{tx.note ?? "-"}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>

						{/* Mobile Cards */}
						<div className="divide-y md:hidden">
							{transactions.map((tx) => (
								<div key={tx.id} className="px-6 py-4">
									<div className="flex items-center justify-between">
										<span className="text-sm font-medium text-neutral-900">
											{formatTransactionType(tx.type)}
										</span>
										<span
											className={`text-sm font-medium ${
												tx.amount >= 0 ? "text-green-600" : "text-red-600"
											}`}
										>
											{tx.amount >= 0 ? "+" : ""}
											{formatMoney(Math.abs(tx.amount), currency)}
										</span>
									</div>
									<div className="mt-1 flex items-center justify-between">
										<span className="text-xs text-neutral-500">
											{formatDate(tx.createdAt)}
										</span>
										<span className="text-xs text-neutral-500">
											Balance: {formatMoney(tx.balanceAfter, currency)}
										</span>
									</div>
									{tx.note && (
										<p className="mt-1 text-xs text-neutral-400">{tx.note}</p>
									)}
								</div>
							))}
						</div>
					</>
				)}
			</div>

			{/* Quick Links */}
			<div className="mt-8 flex gap-4">
				<LinkWithChannel
					href="/account"
					className="rounded border px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
				>
					My Account
				</LinkWithChannel>
				<LinkWithChannel
					href="/orders"
					className="rounded border px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
				>
					View Orders
				</LinkWithChannel>
			</div>
		</div>
	);
}
