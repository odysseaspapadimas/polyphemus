import { ApiResponse, ShowSummary_Full } from "better-trakt";
import { test } from "src/utils/trakt";

export async function GET() {
  const show = await test();

  return Response.json({ show });
}
