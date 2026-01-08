import { LinkWithChannel } from "../atoms/LinkWithChannel";

export interface BreadcrumbItem {
	label: string;
	href?: string;
}

interface BreadcrumbProps {
	items: BreadcrumbItem[];
	className?: string;
}

export function Breadcrumb({ items, className = "" }: BreadcrumbProps) {
	return (
		<nav aria-label="Breadcrumb" className={`text-sm text-neutral-500 ${className}`}>
			<ol className="flex flex-wrap items-center gap-1">
				<li>
					<LinkWithChannel
						href="/"
						className="hover:text-neutral-700 hover:underline"
					>
						Home
					</LinkWithChannel>
				</li>
				{items.map((item, index) => (
					<li key={index} className="flex items-center gap-1">
						<span className="text-neutral-400">/</span>
						{item.href ? (
							<LinkWithChannel
								href={item.href}
								className="hover:text-neutral-700 hover:underline"
							>
								{item.label}
							</LinkWithChannel>
						) : (
							<span className="text-neutral-900">{item.label}</span>
						)}
					</li>
				))}
			</ol>
		</nav>
	);
}
