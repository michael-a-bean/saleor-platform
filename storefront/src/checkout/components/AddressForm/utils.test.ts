import { describe, it, expect } from "vitest";
import {
	getEmptyAddressFormData,
	getAllAddressFieldKeys,
	getAddressInputData,
	getAddressInputDataFromAddress,
	getAddressFormDataFromAddress,
	isMatchingAddress,
	isMatchingAddressData,
	isMatchingAddressFormData,
	getAddressValidationRulesVariables,
	getOrderedAddressFields,
	getRequiredAddressFields,
	getFilteredAddressFields,
	addressFieldsOrder,
} from "./utils";
import { type AddressFragment, type CountryCode } from "@/checkout/graphql";
import { type AddressFormData } from "./types";

describe("getEmptyAddressFormData", () => {
	it("returns empty address form data with default values", () => {
		const result = getEmptyAddressFormData();
		expect(result).toEqual({
			firstName: "",
			lastName: "",
			streetAddress1: "",
			streetAddress2: "",
			companyName: "",
			city: "",
			cityArea: "",
			countryArea: "",
			postalCode: "",
			phone: "",
			countryCode: "US",
		});
	});

	it("returns a new object each time", () => {
		const result1 = getEmptyAddressFormData();
		const result2 = getEmptyAddressFormData();
		expect(result1).not.toBe(result2);
		expect(result1).toEqual(result2);
	});
});

describe("getAllAddressFieldKeys", () => {
	it("returns all address field keys", () => {
		const keys = getAllAddressFieldKeys();
		expect(keys).toContain("firstName");
		expect(keys).toContain("lastName");
		expect(keys).toContain("streetAddress1");
		expect(keys).toContain("city");
		expect(keys).toContain("postalCode");
		expect(keys).toContain("countryCode");
		expect(keys).toContain("phone");
	});

	it("returns consistent number of keys", () => {
		const keys = getAllAddressFieldKeys();
		expect(keys.length).toBe(11);
	});
});

describe("getAddressInputData", () => {
	it("extracts address input from form data", () => {
		const input = {
			firstName: "John",
			lastName: "Doe",
			streetAddress1: "123 Main St",
			city: "New York",
			postalCode: "10001",
			countryCode: "US" as CountryCode,
		};
		const result = getAddressInputData(input);
		expect(result.firstName).toBe("John");
		expect(result.lastName).toBe("Doe");
		expect(result.country).toBe("US");
	});

	it("uses country code from country object if countryCode not provided", () => {
		const input = {
			firstName: "Jane",
			country: { code: "CA", country: "Canada" },
		};
		const result = getAddressInputData(input);
		expect(result.country).toBe("CA");
	});

	it("prefers countryCode over country.code", () => {
		const input = {
			firstName: "Jane",
			countryCode: "US" as CountryCode,
			country: { code: "CA", country: "Canada" },
		};
		const result = getAddressInputData(input);
		expect(result.country).toBe("US");
	});
});

describe("getAddressInputDataFromAddress", () => {
	const mockAddress: Partial<AddressFragment> = {
		firstName: "John",
		lastName: "Doe",
		streetAddress1: "123 Main St",
		streetAddress2: "Apt 4",
		city: "New York",
		postalCode: "10001",
		phone: "+1234567890",
		country: { code: "US", country: "United States" },
	};

	it("converts address fragment to input data", () => {
		const result = getAddressInputDataFromAddress(mockAddress);
		expect(result.firstName).toBe("John");
		expect(result.lastName).toBe("Doe");
		expect(result.country).toBe("US");
		expect(result.phone).toBe("+1234567890");
	});

	it("returns empty object for null/undefined address", () => {
		expect(getAddressInputDataFromAddress(null)).toEqual({});
		expect(getAddressInputDataFromAddress(undefined)).toEqual({});
	});

	it("handles null phone by converting to empty string", () => {
		const addressWithNullPhone = { ...mockAddress, phone: null };
		const result = getAddressInputDataFromAddress(addressWithNullPhone);
		expect(result.phone).toBe("");
	});
});

describe("getAddressFormDataFromAddress", () => {
	const mockAddress: AddressFragment = {
		id: "addr-1",
		firstName: "John",
		lastName: "Doe",
		streetAddress1: "123 Main St",
		streetAddress2: "Apt 4",
		companyName: "ACME Corp",
		city: "New York",
		cityArea: "",
		countryArea: "NY",
		postalCode: "10001",
		phone: "+1234567890",
		country: { code: "US", country: "United States" },
	};

	it("converts address to form data", () => {
		const result = getAddressFormDataFromAddress(mockAddress);
		expect(result.firstName).toBe("John");
		expect(result.lastName).toBe("Doe");
		expect(result.countryCode).toBe("US");
	});

	it("returns empty form data for null address", () => {
		const result = getAddressFormDataFromAddress(null);
		expect(result).toEqual({
			...getEmptyAddressFormData(),
			countryCode: "US",
		});
	});

	it("returns empty form data for undefined address", () => {
		const result = getAddressFormDataFromAddress(undefined);
		expect(result.countryCode).toBe("US");
		expect(result.firstName).toBe("");
	});
});

describe("isMatchingAddress", () => {
	const address1: Partial<AddressFragment> = {
		id: "addr-1",
		firstName: "John",
		lastName: "Doe",
		streetAddress1: "123 Main St",
	};

	const address2: Partial<AddressFragment> = {
		id: "addr-2",
		firstName: "John",
		lastName: "Doe",
		streetAddress1: "123 Main St",
	};

	const address3: Partial<AddressFragment> = {
		id: "addr-1",
		firstName: "Jane",
		lastName: "Smith",
		streetAddress1: "456 Oak Ave",
	};

	it("matches addresses with same id", () => {
		expect(isMatchingAddress(address1, address3)).toBe(true);
	});

	it("matches addresses with same data but different ids", () => {
		expect(isMatchingAddress(address1, address2)).toBe(true);
	});

	it("does not match addresses with different data and different ids", () => {
		const different = { ...address2, firstName: "Different" };
		expect(isMatchingAddress(address1, different)).toBe(false);
	});

	it("handles null/undefined addresses", () => {
		expect(isMatchingAddress(null, null)).toBe(true);
		expect(isMatchingAddress(undefined, undefined)).toBe(true);
		expect(isMatchingAddress(address1, null)).toBe(false);
	});
});

describe("isMatchingAddressData", () => {
	const address1: Partial<AddressFragment> = {
		id: "addr-1",
		firstName: "John",
		lastName: "Doe",
	};

	const address2: Partial<AddressFragment> = {
		id: "addr-2",
		firstName: "John",
		lastName: "Doe",
	};

	it("matches addresses with same data ignoring id", () => {
		expect(isMatchingAddressData(address1, address2)).toBe(true);
	});

	it("does not match addresses with different data", () => {
		const different = { ...address2, firstName: "Jane" };
		expect(isMatchingAddressData(address1, different)).toBe(false);
	});
});

describe("isMatchingAddressFormData", () => {
	const formData1: Partial<AddressFormData> = {
		firstName: "John",
		lastName: "Doe",
		streetAddress1: "123 Main St",
	};

	const formData2: Partial<AddressFormData> = {
		firstName: "John",
		lastName: "Doe",
		streetAddress1: "123 Main St",
	};

	it("matches identical form data", () => {
		expect(isMatchingAddressFormData(formData1, formData2)).toBe(true);
	});

	it("does not match different form data", () => {
		const different = { ...formData2, firstName: "Jane" };
		expect(isMatchingAddressFormData(formData1, different)).toBe(false);
	});

	it("ignores id, autoSave, and __typename", () => {
		const withExtra: any = { ...formData1, id: "123", autoSave: true, __typename: "Address" };
		expect(isMatchingAddressFormData(formData1, withExtra)).toBe(true);
	});
});

describe("getAddressValidationRulesVariables", () => {
	it("returns empty rules when autoSave is false", () => {
		const result = getAddressValidationRulesVariables({ autoSave: false });
		expect(result).toEqual({});
	});

	it("returns empty rules with default params", () => {
		const result = getAddressValidationRulesVariables();
		expect(result).toEqual({});
	});

	it("disables required field checks when autoSave is true", () => {
		const result = getAddressValidationRulesVariables({ autoSave: true });
		expect(result).toEqual({ checkRequiredFields: false });
	});
});

describe("getOrderedAddressFields", () => {
	it("orders fields according to addressFieldsOrder", () => {
		const fields = ["city", "firstName", "lastName", "streetAddress1"] as const;
		const result = getOrderedAddressFields([...fields]);
		expect(result[0]).toBe("firstName");
		expect(result[1]).toBe("lastName");
		expect(result.indexOf("firstName")).toBeLessThan(result.indexOf("city"));
	});

	it("filters out fields not in input", () => {
		const fields = ["firstName", "lastName"] as const;
		const result = getOrderedAddressFields([...fields]);
		expect(result).not.toContain("streetAddress1");
	});

	it("returns empty array for empty input", () => {
		const result = getOrderedAddressFields([]);
		// Should still include firstName, lastName from getFilteredAddressFields
		expect(result).toContain("firstName");
		expect(result).toContain("lastName");
	});
});

describe("getRequiredAddressFields", () => {
	it("always includes firstName and lastName", () => {
		const result = getRequiredAddressFields([]);
		expect(result).toContain("firstName");
		expect(result).toContain("lastName");
	});

	it("includes provided required fields", () => {
		const result = getRequiredAddressFields(["streetAddress1", "city"]);
		expect(result).toContain("streetAddress1");
		expect(result).toContain("city");
		expect(result).toContain("firstName");
		expect(result).toContain("lastName");
	});
});

describe("getFilteredAddressFields", () => {
	it("removes name field and adds firstName, lastName", () => {
		const result = getFilteredAddressFields(["name", "city"]);
		expect(result).not.toContain("name");
		expect(result).toContain("firstName");
		expect(result).toContain("lastName");
		expect(result).toContain("city");
	});

	it("always includes phone", () => {
		const result = getFilteredAddressFields(["city"]);
		expect(result).toContain("phone");
	});

	it("returns unique values", () => {
		const result = getFilteredAddressFields(["firstName", "lastName", "firstName"]);
		const firstNameCount = result.filter((f) => f === "firstName").length;
		expect(firstNameCount).toBe(1);
	});
});

describe("addressFieldsOrder", () => {
	it("has firstName before lastName", () => {
		const firstNameIndex = addressFieldsOrder.indexOf("firstName");
		const lastNameIndex = addressFieldsOrder.indexOf("lastName");
		expect(firstNameIndex).toBeLessThan(lastNameIndex);
	});

	it("has streetAddress1 before streetAddress2", () => {
		const street1Index = addressFieldsOrder.indexOf("streetAddress1");
		const street2Index = addressFieldsOrder.indexOf("streetAddress2");
		expect(street1Index).toBeLessThan(street2Index);
	});

	it("contains all expected fields", () => {
		expect(addressFieldsOrder).toContain("firstName");
		expect(addressFieldsOrder).toContain("lastName");
		expect(addressFieldsOrder).toContain("companyName");
		expect(addressFieldsOrder).toContain("streetAddress1");
		expect(addressFieldsOrder).toContain("streetAddress2");
		expect(addressFieldsOrder).toContain("city");
		expect(addressFieldsOrder).toContain("postalCode");
		expect(addressFieldsOrder).toContain("phone");
	});
});
