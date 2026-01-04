import { redirect } from "next/navigation";

/**
 * Redirect to the singles-builder channel by default
 */
export default function SinglesBuilderPage() {
	redirect("/singles-builder/singles-builder");
}
