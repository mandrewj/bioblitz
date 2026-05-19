import { NextResponse } from "next/server";
import { getOccurrences, getRegionGeoJSON } from "@/lib/queries";

export const revalidate = 60;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const url = new URL(req.url);
  const researchOnly = url.searchParams.get("rg") === "1";
  const limit = Math.min(20000, Number(url.searchParams.get("limit") ?? 5000));
  const occurrences = getOccurrences(slug, researchOnly, limit);
  const region = getRegionGeoJSON(slug);
  return NextResponse.json({ region, occurrences });
}
