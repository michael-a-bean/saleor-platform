type StatusMessage = { type: "success" | "error"; text: string };

export function StatusBanner({ message }: { message: StatusMessage | null }) {
	if (!message) return null;

	return (
		<div
			className={`mt-4 rounded-md p-4 text-sm ${
				message.type === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
			}`}
		>
			{message.text}
		</div>
	);
}
