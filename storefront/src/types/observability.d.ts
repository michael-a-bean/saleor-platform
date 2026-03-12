declare module "@vercel/otel" {
	export function registerOTel(options: { serviceName: string }): void;
}

declare module "@grafana/faro-web-sdk" {
	export function initializeFaro(options: {
		url: string;
		app: { name: string; version: string; environment: string };
		instrumentations: unknown[];
	}): void;
	export function getWebInstrumentations(options?: { captureConsole?: boolean }): unknown[];
}

declare module "@grafana/faro-web-tracing" {
	export class TracingInstrumentation {}
}
