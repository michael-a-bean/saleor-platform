import nextVitals from "eslint-config-next/core-web-vitals";

const config = [
	...nextVitals,
	{
		ignores: [".next/**", "out/**", "build/**", "next-env.d.ts"],
	},
	{
		// Temporarily downgrade React Compiler errors to warnings
		// TODO: Fix these issues in the codebase, then remove this rule override
		rules: {
			"react-compiler/react-compiler": "warn",
		},
	},
];

export default config;
