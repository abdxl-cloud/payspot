export async function POST(request: Request) {
  void request;
  return Response.json(
    { error: "Deprecated. Use /api/t/<slug>/payments/init." },
    { status: 410 },
  );
}
