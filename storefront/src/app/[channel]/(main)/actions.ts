"use server";

import { redirect } from "next/navigation";

export async function handleSearchAction(formData: FormData) {
	const search = formData.get("search") as string;
	const channel = formData.get("channel") as string;
	if (search && search.trim().length > 0 && channel) {
		redirect(`/${encodeURIComponent(channel)}/search?query=${encodeURIComponent(search)}`);
	}
}
