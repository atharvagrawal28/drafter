import { NextRequest, NextResponse } from "next/server";
import { buildGapDocx } from "@/lib/export/docx";
import type { GapReport } from "@/lib/types";
import type { DDItem } from "@/lib/engine/dueDiligence";
import type { EligibilityReport } from "@/lib/engine/eligibility";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Standalone gap / compliance report export as a DOCX so it can travel as a
 * self-contained document to the merchant banker. Optionally embeds the
 * due-diligence checklist when the banker workspace requests it.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const gapReport = body?.gapReport as GapReport | undefined;
  const dueDiligence = body?.dueDiligence as DDItem[] | undefined;
  const eligibility = body?.eligibility as EligibilityReport | undefined;

  if (!gapReport?.items?.length) {
    return NextResponse.json({ error: "A gap report is required" }, { status: 400 });
  }

  try {
    const docx = await import("docx");
    const buffer = await buildGapDocx(docx, gapReport, dueDiligence, eligibility);
    const suffix = dueDiligence?.length ? "DD_Checklist" : "Gap_Report";
    const filename = `${gapReport.issuerName.replace(/[^\w]+/g, "_")}_${suffix}.docx`;
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gap report export failed" },
      { status: 500 },
    );
  }
}
