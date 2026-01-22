import nextVitals from "eslint-config-next/core-web-vitals";
import reactCompiler from "eslint-plugin-react-compiler";

const config = [
	...nextVitals,
	{
		ignores: [".next/**", "out/**", "build/**", "next-env.d.ts"],
	},
	{
		// Temporarily downgrade React Compiler errors to warnings
		// TODO: Fix these issues in the codebase, then remove this override
		plugins: {
			"react-compiler": reactCompiler,
		},
		rules: {
			"react-compiler/react-compiler": "warn",
		},
	},
];

export default config;
