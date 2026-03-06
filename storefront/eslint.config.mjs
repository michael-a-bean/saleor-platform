import nextVitals from "eslint-config-next/core-web-vitals";

// Downgrade React Compiler informational rules from error to warning.
// These surface valid recommendations but are not blocking issues:
// - set-state-in-effect: Common pattern for syncing state from props/URL params
// - incompatible-library: Expected for Formik and TanStack Virtual
// - preserve-manual-memoization: Existing useMemo/useCallback that compiler can't preserve
const config = nextVitals.map((configObj) => {
	const rules = configObj.rules || {};
	const hasReactHooksRules = Object.keys(rules).some((key) => key.startsWith("react-hooks/"));
	if (hasReactHooksRules) {
		return {
			...configObj,
			rules: {
				...rules,
				"react-hooks/set-state-in-effect": "warn",
				"react-hooks/incompatible-library": "warn",
				"react-hooks/preserve-manual-memoization": "warn",
			},
		};
	}
	return configObj;
});

config.push({
	ignores: [".next/**", "out/**", "build/**", "next-env.d.ts"],
});

export default config;
