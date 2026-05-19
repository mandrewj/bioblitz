import { NextResponse } from "next/server";
import { getTopContributors } from "@/lib/queries";

export const revalidate = 60;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const url = new URL(req.url);
  const researchOnly = url.searchParams.get("rg") === "1";
  const limit = Math.max(1, Math.min(50, Number(url.searchParams.get("limit") ?? 15)));
  const result = getTopContributors(slug, researchOnly, limit);
  return NextResponse.json(result);
}
