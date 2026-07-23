import { NextRequest, NextResponse } from "next/server";
import { buildDocx } from "@/lib/export/docx";
import type { DrhpDocument, GapReport } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const document = body?.document as DrhpDocument | undefined;
  const gapReport = body?.gapReport as GapReport | undefined;

  if (!document?.chapters?.length) {
    return NextResponse.json({ error: "A generated document is required" }, { status: 400 });
  }

  try {
    const docx = await import("docx");
    const buffer = await buildDocx(docx, document, gapReport ?? ({} as GapReport));
    const filename = `${document.issuerName.replace(/[^\w]+/g, "_")}_Draft_DRHP.docx`;
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "DOCX export failed" },
      { status: 500 },
    );
  }
}
