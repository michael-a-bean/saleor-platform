export const EMAIL_REGEX = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;

export const getById =
	<TId extends string = string>(idToCompare: TId | undefined) =>
	(obj: { id: string }) =>
		obj.id === idToCompare;

export const getByUnmatchingId =
	<T extends { id: string }>(idToCompare: string | undefined) =>
	(obj: T) =>
		obj.id !== idToCompare;

export const isValidEmail = (email: string): boolean => {
	return !!email && EMAIL_REGEX.test(email);
};
