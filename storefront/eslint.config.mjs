import nextVitals from "eslint-config-next/core-web-vitals";

// Downgrade incompatible-library from error to warning — TanStack Virtual
// uses interior mutability that the compiler can't optimize. This is expected
// and "use no memo" is applied to affected components.
const config = nextVitals.map((configObj) => {
	const rules = configObj.rules || {};
	const hasReactHooksRules = Object.keys(rules).some((key) => key.startsWith("react-hooks/"));
	if (hasReactHooksRules) {
		return {
			...configObj,
			rules: {
				...rules,
				"react-hooks/incompatible-library": "warn",
			},
		};
	}
	return configObj;
});

config.push({
	ignores: [".next/**", "out/**", "build/**", "next-env.d.ts", "src/gql/**"],
});

export default config;
