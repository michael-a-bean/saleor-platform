import nextVitals from "eslint-config-next/core-web-vitals";

// Filter out React Compiler config from nextVitals temporarily
// TODO: Fix React Compiler issues in the codebase and re-enable
const configsWithoutReactCompiler = nextVitals.filter((configObj) => {
	// Skip config objects that have only react-compiler plugin
	const pluginKeys = Object.keys(configObj.plugins || {});
	if (pluginKeys.length === 1 && pluginKeys[0] === "react-compiler") {
		return false;
	}
	return true;
});

const config = [
	...configsWithoutReactCompiler,
	{
		ignores: [".next/**", "out/**", "build/**", "next-env.d.ts"],
	},
];

export default config;
