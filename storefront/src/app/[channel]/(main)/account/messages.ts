type StatusMessage = { type: "success" | "error"; text: string };

const accountMessages: Record<string, StatusMessage> = {
	profile_updated: { type: "success", text: "Profile updated successfully." },
	profile_error: { type: "error", text: "Failed to update profile." },
	password_changed: { type: "success", text: "Password changed successfully." },
	password_error: { type: "error", text: "Failed to change password." },
	password_required: { type: "error", text: "Current password is required." },
	passwords_mismatch: { type: "error", text: "Passwords do not match." },
	password_too_short: { type: "error", text: "Password must be at least 8 characters." },
};

const addressMessages: Record<string, StatusMessage> = {
	address_added: { type: "success", text: "Address added successfully." },
	address_updated: { type: "success", text: "Address updated successfully." },
	address_deleted: { type: "success", text: "Address deleted successfully." },
	default_updated: { type: "success", text: "Default address updated." },
	create_error: { type: "error", text: "Failed to add address." },
	update_error: { type: "error", text: "Failed to update address." },
	delete_error: { type: "error", text: "Failed to delete address." },
	default_error: { type: "error", text: "Failed to update default address." },
	invalid_address: { type: "error", text: "Invalid address." },
};

export function getAccountMessage(status: string | undefined): StatusMessage | null {
	if (!status) return null;
	return accountMessages[status] ?? null;
}

export function getAddressMessage(status: string | undefined): StatusMessage | null {
	if (!status) return null;
	return addressMessages[status] ?? null;
}
