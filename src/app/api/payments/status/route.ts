export async function POST(request: Request) {
  void request;
  return Response.json(
    { error: "Deprecated. Use /api/t/<slug>/payments/status." },
    { status: 410 },
  );
}
