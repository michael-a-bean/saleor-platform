import { cookies } from "next/headers";

// Types for customer API responses

export type StoreCreditBalance = {
	balance: number;
	currency: string;
};

export type CreditTransaction = {
	id: string;
	type: string;
	amount: number;
	currency: string;
	balanceAfter: number;
	note: string | null;
	createdAt: string;
};

export type CreditHistoryResponse = {
	transactions: CreditTransaction[];
	total: number;
	limit: number;
	offset: number;
};

export type CustomerGroup = {
	id: string;
	name: string;
	discountPercent: number;
};

export type CustomerGroupsResponse = {
	groups: CustomerGroup[];
};

async function getAccessToken(): Promise<string | null> {
	const cookieStore = await cookies();
	return cookieStore.get("saleor_auth_access_token")?.value ?? null;
}

function getBaseUrl(): string | null {
	const url = process.env.INVENTORY_OPS_URL;
	if (!url) {
		console.warn("INVENTORY_OPS_URL environment variable is not set");
		return null;
	}
	return url.replace(/\/$/, "");
}

async function fetchCustomerAPI<T>(path: string): Promise<T | null> {
	const token = await getAccessToken();
	if (!token) {
		return null;
	}

	const baseUrl = getBaseUrl();
	if (!baseUrl) {
		return null;
	}

	try {
		const response = await fetch(`${baseUrl}${path}`, {
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
			},
			cache: "no-cache",
		});

		if (response.status === 401) {
			return null;
		}

		if (!response.ok) {
			console.warn(`Customer API error: ${response.status} ${response.statusText} for ${path}`);
			return null;
		}

		return (await response.json()) as T;
	} catch (error) {
		console.warn(`Customer API network error for ${path}:`, error);
		return null;
	}
}

export async function getStoreCredit(): Promise<StoreCreditBalance | null> {
	return fetchCustomerAPI<StoreCreditBalance>("/api/customer/credit/balance");
}

export async function getCreditHistory(
	limit = 50,
	offset = 0,
): Promise<CreditHistoryResponse | null> {
	return fetchCustomerAPI<CreditHistoryResponse>(
		`/api/customer/credit/history?limit=${limit}&offset=${offset}`,
	);
}

export async function getCustomerGroups(): Promise<CustomerGroupsResponse | null> {
	return fetchCustomerAPI<CustomerGroupsResponse>("/api/customer/groups");
}
