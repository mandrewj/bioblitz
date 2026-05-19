import { NextResponse } from "next/server";
import { getViewSummary } from "@/lib/queries";

export const revalidate = 60;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const url = new URL(req.url);
  const researchOnly = url.searchParams.get("rg") === "1";
  const summary = getViewSummary(slug, researchOnly);
  if (!summary) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(summary);
}
