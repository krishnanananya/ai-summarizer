import { NextResponse } from "next/server";
import { readCache } from "@/lib/cache";
import { CONFIG } from "@/lib/config";
import type { ItemType } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const blob = await readCache();
  return NextResponse.json({
    generatedAt: blob?.generatedAt ?? null,
    tabs: blob?.tabs ?? {},
    llmDeltaDays: blob?.llmDeltaDays ?? null,
    digest: blob?.digest ?? null,
    config: Object.fromEntries(
      Object.entries(CONFIG).map(([k, v]) => [
        k,
        {
          // The client only uses `enabled` to decide which tabs to show, so
          // hidden-but-fetched tabs report as disabled here. A tab that came
          // back empty from the last refresh (e.g. Discussion without Reddit
          // creds) is hidden too — a dead tab in the nav erodes trust — and
          // reappears automatically once a refresh fills it.
          enabled:
            v.enabled &&
            !v.hiddenInUi &&
            (!blob || (blob.tabs[k as ItemType]?.items.length ?? 0) > 0),
          windowDays: v.windowDays,
          label: v.label,
        },
      ])
    ),
  });
}
