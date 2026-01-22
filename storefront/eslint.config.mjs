import nextVitals from "eslint-config-next/core-web-vitals";

// Override React Compiler severity from 'error' to 'warn' in the configs that have it
const configWithOverrides = nextVitals.map((configObj) => {
	if (configObj.rules?.["react-compiler/react-compiler"]) {
		return {
			...configObj,
			rules: {
				...configObj.rules,
				// Temporarily downgrade React Compiler errors to warnings
				// TODO: Fix these issues in the codebase, then remove this override
				"react-compiler/react-compiler": "warn",
			},
		};
	}
	return configObj;
});

const config = [
	...configWithOverrides,
	{
		ignores: [".next/**", "out/**", "build/**", "next-env.d.ts"],
	},
];

export default config;
