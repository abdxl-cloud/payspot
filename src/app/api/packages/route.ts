export async function GET() {
  return Response.json(
    { error: "Deprecated. Use /api/t/<slug>/packages." },
    { status: 410 },
  );
}
