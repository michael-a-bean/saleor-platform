"use client";

import { useEffect } from "react";

let faroInitialized = false;

export function FaroObservability() {
	useEffect(() => {
		if (faroInitialized) return;

		const collectorUrl = process.env.NEXT_PUBLIC_GRAFANA_FARO_URL;
		if (!collectorUrl) return;

		faroInitialized = true;

		import("@grafana/faro-web-sdk").then(({ initializeFaro, getWebInstrumentations }) => {
			import("@grafana/faro-web-tracing").then(({ TracingInstrumentation }) => {
				initializeFaro({
					url: collectorUrl,
					app: {
						name: "storefront",
						version: process.env.NEXT_PUBLIC_BUILD_ID || "dev",
						environment: process.env.NODE_ENV || "development",
					},
					instrumentations: [
						...getWebInstrumentations({
							captureConsole: false,
						}),
						new TracingInstrumentation(),
					],
				});
			});
		});
	}, []);

	return null;
}
