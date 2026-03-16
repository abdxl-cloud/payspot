export async function register() {
  // Only run in the Node.js runtime (not Edge), and only in server context.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startTransactionPoller } = await import(
      "@/lib/transaction-poller"
    );
    startTransactionPoller();
  }
}
