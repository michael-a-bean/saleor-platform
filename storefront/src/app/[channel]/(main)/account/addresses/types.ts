export type AccountAddress = {
	id: string;
	firstName: string;
	lastName: string;
	companyName: string;
	streetAddress1: string;
	streetAddress2: string;
	city: string;
	postalCode: string;
	countryArea: string;
	country: { country: string; code: string };
	phone?: string | null;
};
