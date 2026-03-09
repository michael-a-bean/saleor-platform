import { UserIcon } from "lucide-react";
import { UserMenu } from "./UserMenu";
import { CurrentUserDocument } from "@/gql/graphql";
import { executeGraphQL } from "@/lib/graphql";
import { getStoreCredit } from "@/lib/customer-api";
import { LinkWithChannel } from "@/ui/atoms/LinkWithChannel";

export async function UserMenuContainer() {
	const { me: user } = await executeGraphQL(CurrentUserDocument, {
		cache: "no-cache",
	});

	if (user) {
		const credit = await getStoreCredit();
		return (
			<UserMenu
				user={user}
				creditBalance={credit?.balance ?? 0}
				creditCurrency={credit?.currency ?? "USD"}
			/>
		);
	} else {
		return (
			<LinkWithChannel href="/login" className="h-6 w-6 flex-shrink-0">
				<UserIcon className="h-6 w-6 shrink-0" aria-hidden="true" />
				<span className="sr-only">Log in</span>
			</LinkWithChannel>
		);
	}
}
