import { notFound, redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { executeGraphQL } from "@/lib/graphql";
import { CurrentUserDocument, OrderByIdDocument } from "@/gql/graphql";
import { formatDate, formatMoney, getHrefForVariant } from "@/lib/utils";
import { PaymentStatus } from "@/ui/components/PaymentStatus";
import { LinkWithChannel } from "@/ui/atoms/LinkWithChannel";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: { params: Promise<{ id: string }> }) {
	const params = await props.params;
	return {
		title: `Order ${params.id.split("-")[0]} | Orders`,
	};
}

export default async function OrderDetailPage(props: {
	params: Promise<{ channel: string; id: string }>;
}) {
	const params = await props.params;
	const { channel, id } = params;

	// Check if user is logged in
	const { me: user } = await executeGraphQL(CurrentUserDocument, {
		cache: "no-cache",
	});

	if (!user) {
		redirect(`/${channel}/orders`);
	}

	// Fetch order details
	const { order } = await executeGraphQL(OrderByIdDocument, {
		variables: { id },
		cache: "no-cache",
	});

	if (!order) {
		notFound();
	}

	const fulfillment = order.fulfillments?.[0];

	return (
		<div className="mx-auto max-w-4xl p-8">
			{/* Header */}
			<div className="mb-8">
				<Link
					href={`/${channel}/orders`}
					className="mb-4 inline-flex items-center text-sm text-neutral-600 hover:text-neutral-900"
				>
					<svg className="mr-1 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
					</svg>
					Back to orders
				</Link>
				<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
					<h1 className="text-2xl font-bold tracking-tight text-neutral-900">
						Order #{order.number}
					</h1>
					<PaymentStatus status={order.paymentStatus} />
				</div>
				<p className="mt-1 text-sm text-neutral-600">
					Placed on {formatDate(new Date(order.created))}
				</p>
			</div>

			<div className="grid gap-8 lg:grid-cols-3">
				{/* Order Items */}
				<div className="lg:col-span-2">
					<div className="rounded-lg border bg-white">
						<div className="border-b px-6 py-4">
							<h2 className="font-semibold text-neutral-900">Order Items</h2>
						</div>
						<ul className="divide-y">
							{order.lines.map((line) => {
								const imageUrl =
									line.variant?.product?.media?.[0]?.url || line.thumbnail?.url;
								const imageAlt =
									line.variant?.product?.media?.[0]?.alt || line.thumbnail?.alt || "";

								return (
									<li key={line.id} className="flex gap-4 px-6 py-4">
										{imageUrl && (
											<div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-md border bg-neutral-50">
												<Image
													src={imageUrl}
													alt={imageAlt}
													width={80}
													height={80}
													className="h-full w-full object-contain object-center"
												/>
											</div>
										)}
										<div className="flex flex-1 flex-col">
											<div className="flex justify-between">
												<div>
													{line.variant?.product?.slug ? (
														<LinkWithChannel
															href={getHrefForVariant({
																productSlug: line.variant.product.slug,
																variantId: line.variant.id,
															})}
															className="font-medium text-neutral-900 hover:underline"
														>
															{line.productName}
														</LinkWithChannel>
													) : (
														<span className="font-medium text-neutral-900">
															{line.productName}
														</span>
													)}
													{line.variantName && (
														<p className="mt-1 text-sm text-neutral-500">
															{line.variantName}
														</p>
													)}
												</div>
												<p className="font-medium text-neutral-900">
													{formatMoney(
														line.totalPrice.gross.amount,
														line.totalPrice.gross.currency,
													)}
												</p>
											</div>
											<p className="mt-1 text-sm text-neutral-500">
												Qty: {line.quantity} &times;{" "}
												{formatMoney(
													line.unitPrice.gross.amount,
													line.unitPrice.gross.currency,
												)}
											</p>
										</div>
									</li>
								);
							})}
						</ul>
					</div>

					{/* Fulfillment Status */}
					{fulfillment && (
						<div className="mt-6 rounded-lg border bg-white">
							<div className="border-b px-6 py-4">
								<h2 className="font-semibold text-neutral-900">Fulfillment</h2>
							</div>
							<div className="px-6 py-4">
								<div className="flex items-center gap-2">
									<span
										className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
											fulfillment.status === "FULFILLED"
												? "bg-green-100 text-green-800"
												: "bg-yellow-100 text-yellow-800"
										}`}
									>
										{fulfillment.status}
									</span>
									<span className="text-sm text-neutral-500">
										{formatDate(new Date(fulfillment.created))}
									</span>
								</div>
								{fulfillment.trackingNumber && (
									<p className="mt-2 text-sm">
										<span className="text-neutral-600">Tracking:</span>{" "}
										<span className="font-medium">{fulfillment.trackingNumber}</span>
									</p>
								)}
							</div>
						</div>
					)}
				</div>

				{/* Order Summary Sidebar */}
				<div className="lg:col-span-1">
					{/* Summary */}
					<div className="rounded-lg border bg-white">
						<div className="border-b px-6 py-4">
							<h2 className="font-semibold text-neutral-900">Order Summary</h2>
						</div>
						<dl className="space-y-3 px-6 py-4 text-sm">
							<div className="flex justify-between">
								<dt className="text-neutral-600">Subtotal</dt>
								<dd className="font-medium text-neutral-900">
									{order.subtotal &&
										formatMoney(order.subtotal.gross.amount, order.subtotal.gross.currency)}
								</dd>
							</div>
							<div className="flex justify-between">
								<dt className="text-neutral-600">Shipping</dt>
								<dd className="font-medium text-neutral-900">
									{order.shippingPrice
										? formatMoney(
												order.shippingPrice.gross.amount,
												order.shippingPrice.gross.currency,
										  )
										: "Free"}
								</dd>
							</div>
							{order.total.tax && order.total.tax.amount > 0 && (
								<div className="flex justify-between">
									<dt className="text-neutral-600">Tax</dt>
									<dd className="font-medium text-neutral-900">
										{formatMoney(order.total.tax.amount, order.total.tax.currency)}
									</dd>
								</div>
							)}
							<div className="flex justify-between border-t pt-3">
								<dt className="font-semibold text-neutral-900">Total</dt>
								<dd className="font-semibold text-neutral-900">
									{formatMoney(order.total.gross.amount, order.total.gross.currency)}
								</dd>
							</div>
						</dl>
					</div>

					{/* Shipping Address */}
					{order.shippingAddress && (
						<div className="mt-6 rounded-lg border bg-white">
							<div className="border-b px-6 py-4">
								<h2 className="font-semibold text-neutral-900">Shipping Address</h2>
							</div>
							<div className="px-6 py-4 text-sm text-neutral-600">
								<p className="font-medium text-neutral-900">
									{order.shippingAddress.firstName} {order.shippingAddress.lastName}
								</p>
								<p>{order.shippingAddress.streetAddress1}</p>
								{order.shippingAddress.streetAddress2 && (
									<p>{order.shippingAddress.streetAddress2}</p>
								)}
								<p>
									{order.shippingAddress.city}, {order.shippingAddress.postalCode}
								</p>
								<p>{order.shippingAddress.country.country}</p>
								{order.shippingAddress.phone && <p className="mt-2">{order.shippingAddress.phone}</p>}
							</div>
						</div>
					)}

					{/* Shipping Method */}
					{order.shippingMethodName && (
						<div className="mt-6 rounded-lg border bg-white">
							<div className="border-b px-6 py-4">
								<h2 className="font-semibold text-neutral-900">Shipping Method</h2>
							</div>
							<div className="px-6 py-4 text-sm text-neutral-600">
								<p>{order.shippingMethodName}</p>
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
