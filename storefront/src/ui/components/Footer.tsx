import Link from "next/link";
import Image from "next/image";
import { LinkWithChannel } from "../atoms/LinkWithChannel";
import { ChannelSelect } from "./ChannelSelect";
import { ChannelsListDocument, MenuGetBySlugDocument } from "@/gql/graphql";
import { executeGraphQL } from "@/lib/graphql";

const COMPANY_NAME = "Shuffle and Cut Games";

export async function Footer({ channel }: { channel: string }) {
	const footerLinks = await executeGraphQL(MenuGetBySlugDocument, {
		variables: { slug: "footer", channel },
		revalidate: 60 * 60 * 24,
	});
	const channels = process.env.SALEOR_APP_TOKEN
		? await executeGraphQL(ChannelsListDocument, {
				withAuth: false, // disable cookie-based auth for this call
				headers: {
					// and use app token instead
					Authorization: `Bearer ${process.env.SALEOR_APP_TOKEN}`,
				},
		  })
		: null;
	const currentYear = new Date().getFullYear();

	return (
		<footer className="border-t border-neutral-200 bg-neutral-50">
			<div className="mx-auto max-w-7xl px-4 lg:px-8">
				<div className="grid grid-cols-2 gap-8 py-16 sm:grid-cols-4">
					{footerLinks.menu?.items?.map((item) => {
						return (
							<div key={item.id}>
								<h3 className="text-sm font-semibold text-neutral-900">{item.name}</h3>
								<ul className="mt-4 space-y-4">
									{item.children?.map((child) => {
										if (child.category) {
											return (
												<li key={child.id} className="text-sm">
													<LinkWithChannel
														href={`/categories/${child.category.slug}`}
														className="text-neutral-500 transition-colors hover:text-brand-secondary"
													>
														{child.category.name}
													</LinkWithChannel>
												</li>
											);
										}
										if (child.collection) {
											return (
												<li key={child.id} className="text-sm">
													<LinkWithChannel
														href={`/collections/${child.collection.slug}`}
														className="text-neutral-500 transition-colors hover:text-brand-secondary"
													>
														{child.collection.name}
													</LinkWithChannel>
												</li>
											);
										}
										if (child.page) {
											return (
												<li key={child.id} className="text-sm">
													<LinkWithChannel
														href={`/pages/${child.page.slug}`}
														className="text-neutral-500 transition-colors hover:text-brand-secondary"
													>
														{child.page.title}
													</LinkWithChannel>
												</li>
											);
										}
										if (child.url) {
											return (
												<li key={child.id} className="text-sm">
													<LinkWithChannel
														href={child.url}
														className="text-neutral-500 transition-colors hover:text-brand-secondary"
													>
														{child.name}
													</LinkWithChannel>
												</li>
											);
										}
										return null;
									})}
								</ul>
							</div>
						);
					})}

					{/* Static Help section - always visible */}
					<div>
						<h3 className="text-sm font-semibold text-neutral-900">Help & Info</h3>
						<ul className="mt-4 space-y-4">
							<li className="text-sm">
								<LinkWithChannel
									href="/contact"
									className="text-neutral-500 transition-colors hover:text-brand-secondary"
								>
									Contact Us
								</LinkWithChannel>
							</li>
							<li className="text-sm">
								<LinkWithChannel
									href="/orders"
									className="text-neutral-500 transition-colors hover:text-brand-secondary"
								>
									My Orders
								</LinkWithChannel>
							</li>
							<li className="text-sm">
								<LinkWithChannel
									href="/pages/privacy-policy"
									className="text-neutral-500 transition-colors hover:text-brand-secondary"
								>
									Privacy Policy
								</LinkWithChannel>
							</li>
							<li className="text-sm">
								<LinkWithChannel
									href="/pages/terms-of-service"
									className="text-neutral-500 transition-colors hover:text-brand-secondary"
								>
									Terms of Service
								</LinkWithChannel>
							</li>
							<li className="text-sm">
								<LinkWithChannel
									href="/pages/return-policy"
									className="text-neutral-500 transition-colors hover:text-brand-secondary"
								>
									Return Policy
								</LinkWithChannel>
							</li>
						</ul>
					</div>
				</div>

				{channels?.channels && (
					<div className="mb-4 text-neutral-500">
						<label>
							<span className="text-sm">Change currency:</span> <ChannelSelect channels={channels.channels} />
						</label>
					</div>
				)}

				<div className="flex flex-col justify-between border-t border-neutral-200 py-10 sm:flex-row">
					<p className="text-sm text-neutral-500">
						Copyright &copy; {currentYear} {COMPANY_NAME}
					</p>
					<p className="flex items-center gap-1 text-sm text-neutral-500">
						Powered by{" "}
						<Link
							target="_blank"
							href="https://saleor.io/"
							className="transition-colors hover:text-brand-secondary"
						>
							Saleor
						</Link>
						<Link
							href="https://github.com/saleor/saleor"
							target="_blank"
							className="opacity-30 transition-opacity hover:opacity-60"
						>
							<Image alt="Saleor github repository" height={20} width={20} src="/github-mark.svg" />
						</Link>
					</p>
				</div>
			</div>
		</footer>
	);
}
