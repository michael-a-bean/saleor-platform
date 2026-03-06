import { debounce } from "lodash-es";
import { useEffect, useMemo, useRef } from "react";

export const useDebouncedSubmit = <TArgs extends Array<any>>(
	onSubmit: (...args: TArgs) => Promise<any> | void,
) => {
	// Use ref to always call the latest onSubmit without recreating the debounced function
	const onSubmitRef = useRef(onSubmit);
	onSubmitRef.current = onSubmit;

	const debouncedSubmit = useMemo(
		() =>
			debounce((...args: TArgs) => {
				void onSubmitRef.current(...args);
			}, 2000),
		[],
	);

	useEffect(() => {
		return () => {
			debouncedSubmit.cancel();
		};
	}, [debouncedSubmit]);

	return debouncedSubmit;
};
