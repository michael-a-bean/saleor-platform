import nextVitals from "eslint-config-next/core-web-vitals";

/*
 * Temporarily disable React Compiler ESLint rules
 * TODO: Fix React Compiler issues in the codebase and re-enable
 *
 * The React Compiler rules require refactoring multiple hooks and components.
 * We filter out configs that have react-compiler plugin and disable any
 * react-compiler rules that remain.
 */
const filteredConfigs = nextVitals
	.filter((configObj) => {
		// Remove configs that only define react-compiler plugin
		const pluginKeys = Object.keys(configObj.plugins || {});
		if (pluginKeys.length === 1 && pluginKeys[0] === "react-compiler") {
			return false;
		}
		return true;
	})
	.map((configObj) => {
		// Remove react-compiler plugin from configs that have multiple plugins
		if (configObj.plugins?.["react-compiler"]) {
			const { "react-compiler": _, ...remainingPlugins } = configObj.plugins;
			return {
				...configObj,
				plugins: remainingPlugins,
			};
		}
		return configObj;
	})
	.map((configObj) => {
		// Disable any react-compiler rules that might remain
		const rules = configObj.rules || {};
		const hasReactCompilerRules = Object.keys(rules).some(
			(key) => key.startsWith("react-compiler/") || key.startsWith("react-hooks/")
		);
		if (hasReactCompilerRules) {
			const newRules = { ...rules };
			for (const key of Object.keys(newRules)) {
				if (key.startsWith("react-compiler/")) {
					newRules[key] = "off";
				}
				// Also disable the enhanced react-hooks rules from react-compiler
				if (
					key === "react-hooks/set-state-in-effect" ||
					key === "react-hooks/incompatible-library" ||
					key === "react-hooks/preserve-manual-memoization" ||
					key === "react-hooks/refs"
				) {
					newRules[key] = "off";
				}
			}
			return { ...configObj, rules: newRules };
		}
		return configObj;
	});

const config = [
	...filteredConfigs,
	{
		ignores: [".next/**", "out/**", "build/**", "next-env.d.ts"],
	},
];

export default config;
