import { NextResponse } from "next/server";
import { getSpeciesList, getSpeciesPhotos, getPhenology } from "@/lib/queries";

export const revalidate = 60;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const url = new URL(req.url);
  const researchOnly = url.searchParams.get("rg") === "1";
  const scientific = url.searchParams.get("scientificName");
  const limit = Math.min(500, Number(url.searchParams.get("limit") ?? 100));
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0));

  if (scientific) {
    const photos = getSpeciesPhotos(slug, scientific);
    const phenology = getPhenology(slug, scientific, researchOnly);
    return NextResponse.json({ scientificName: scientific, photos, phenology });
  }
  const list = getSpeciesList(slug, researchOnly, limit, offset);
  return NextResponse.json({ species: list });
}
