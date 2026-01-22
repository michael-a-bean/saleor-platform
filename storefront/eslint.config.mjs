import nextVitals from "eslint-config-next/core-web-vitals";

/*
 * Temporarily disable React Compiler ESLint rules
 * TODO: Fix React Compiler issues in the codebase and re-enable
 *
 * The React Compiler rules (react-compiler/react-compiler, react-hooks/set-state-in-effect)
 * require refactoring multiple hooks and components. Disable until codebase is updated.
 */
const config = [
	...nextVitals,
	{
		ignores: [".next/**", "out/**", "build/**", "next-env.d.ts"],
	},
	{
		rules: {
			"react-compiler/react-compiler": "off",
			"react-hooks/set-state-in-effect": "off",
		},
	},
];

export default config;
