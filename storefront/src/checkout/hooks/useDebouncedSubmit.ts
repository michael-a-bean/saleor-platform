import { debounce } from "lodash-es";
import { useEffect, useMemo } from "react";

export const useDebouncedSubmit = <TArgs extends Array<any>>(
	onSubmit: (...args: TArgs) => Promise<any> | void,
) => {
	const debouncedSubmit = useMemo(
		() =>
			debounce((...args: TArgs) => {
				void onSubmit(...args);
			}, 300),
		[onSubmit],
	);

	useEffect(() => {
		return () => {
			debouncedSubmit.cancel();
		};
	}, [debouncedSubmit]);

	return debouncedSubmit;
};
