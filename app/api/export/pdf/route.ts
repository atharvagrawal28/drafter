import { NextRequest, NextResponse } from "next/server";
import type { DrhpDocument } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const document = body?.document as DrhpDocument | undefined;

  if (!document?.chapters?.length) {
    return NextResponse.json({ error: "A generated document is required" }, { status: 400 });
  }

  try {
    const [{ renderToBuffer }, { DrhpPdf }, React] = await Promise.all([
      import("@react-pdf/renderer"),
      import("@/lib/export/pdf"),
      import("react"),
    ]);

    const buffer = await renderToBuffer(React.createElement(DrhpPdf, { document }) as any);
    const filename = `${document.issuerName.replace(/[^\w]+/g, "_")}_Draft_DRHP.pdf`;
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "PDF export failed" },
      { status: 500 },
    );
  }
}
