"use client";

import { createContext, useContext, type ReactNode } from "react";

interface StaffContextValue {
	email: string;
	firstName?: string;
	lastName?: string;
}

const StaffContext = createContext<StaffContextValue | null>(null);

export function StaffProvider({
	children,
	email,
	firstName,
	lastName,
}: {
	children: ReactNode;
	email: string;
	firstName?: string;
	lastName?: string;
}) {
	return (
		<StaffContext.Provider value={{ email, firstName, lastName }}>
			{children}
		</StaffContext.Provider>
	);
}

export function useStaff() {
	const context = useContext(StaffContext);
	if (!context) {
		throw new Error("useStaff must be used within a StaffProvider");
	}
	return context;
}
