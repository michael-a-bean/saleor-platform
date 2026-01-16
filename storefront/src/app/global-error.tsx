"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isDevelopment = process.env.NODE_ENV === "development";

  return (
    <html lang="en">
      <body className="min-h-dvh bg-white">
        <div className="mx-auto max-w-7xl px-6 py-12">
          <div className="text-center">
            <h1 className="text-4xl font-bold tracking-tight text-neutral-900 sm:text-5xl">
              Something went wrong
            </h1>
            <p className="mt-6 text-base leading-7 text-neutral-600">
              We encountered an unexpected error. Our team has been notified.
            </p>
            {isDevelopment && error.message && (
              <pre className="mt-4 max-w-2xl mx-auto text-left text-sm bg-red-50 text-red-800 p-4 rounded overflow-x-auto">
                {error.message}
                {error.digest && `\n\nDigest: ${error.digest}`}
              </pre>
            )}
            <div className="mt-10 flex items-center justify-center gap-x-6">
              <button
                onClick={() => reset()}
                className="rounded-md bg-neutral-900 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-neutral-800"
              >
                Try again
              </button>
              <a
                href="/"
                className="rounded-md border border-neutral-300 bg-white px-6 py-3 text-sm font-semibold text-neutral-700 shadow-sm hover:bg-neutral-50"
              >
                Go home
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
