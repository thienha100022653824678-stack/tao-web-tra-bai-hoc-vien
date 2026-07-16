// src/app/api/v2/diagnostics/route.ts
//
// Worker-secret-gated runtime diagnostics for the Portal (student-web).
// Returns the current V2 runtime mode + per-feature flag posture so the
// admin / sync worker can introspect the switch without a redeploy.
//
// Authorization: the request must supply the V2 worker secret via the
// `x-v2-worker-secret` or `x-sync-secret` header. The expected secret is
// read from `V2_WORKER_SECRET` (preferred) or `INTERNAL_SYNC_SECRET`
// (fallback). Missing/mismatched → 401. This mirrors the LMS
// `assertV2WorkerAuthorized` gate.
//
// Methods: GET and POST both return the same diagnostics payload. Any other
// method → 405. The payload never echoes env secret values; it only reports
// the configured + effective state of the non-secret behavioral flags.

import { NextRequest, NextResponse } from 'next/server';
import { assertV2WorkerAuthorized } from '@/lib/v2-sync-worker';
import { getRuntimeSnapshot } from '@/lib/v2-runtime-controller';
import {
  isV2FlagConfigured,
  isV2GlobalOneDeviceEnabled,
  isV2CorsAllowlistEnabled,
  V2_FLAGS
} from '@/lib/v2-flags';

export async function GET(request: NextRequest) {
  return handleDiagnostics(request);
}

export async function POST(request: NextRequest) {
  return handleDiagnostics(request);
}

async function handleDiagnostics(request: NextRequest): Promise<NextResponse> {
  try {
    assertV2WorkerAuthorized({ headers: request.headers });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized: worker secret is invalid or missing.' },
      { status: 401 }
    );
  }

  const snapshot = await getRuntimeSnapshot();

  return NextResponse.json({
    ok: true,
    component: 'portal',
    activeMode: snapshot.activeMode,
    killSwitch: snapshot.killSwitch,
    source: snapshot.source,
    flags: {
      globalOneDevice: {
        configured: isV2FlagConfigured(V2_FLAGS.GLOBAL_ONE_DEVICE_ENABLED),
        effective: isV2GlobalOneDeviceEnabled()
      },
      corsAllowlist: {
        configured: isV2FlagConfigured(V2_FLAGS.CORS_ALLOWLIST_ENABLED),
        effective: isV2CorsAllowlistEnabled()
      }
    }
  });
}
