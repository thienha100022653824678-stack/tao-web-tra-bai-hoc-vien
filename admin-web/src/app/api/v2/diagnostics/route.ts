import { NextResponse } from 'next/server';

import { getRuntimeSnapshot, isV2Active } from '@/lib/v2-runtime-controller';
import {
  isV2FlagConfigured,
  isV2GlobalOneDeviceEnabled,
  isV2CorsAllowlistEnabled,
  V2_FLAGS,
} from '@/lib/v2-flags';
import { assertV2WorkerAuthorized } from '@/lib/v2-sync-worker';

// Worker-secret gated diagnostics endpoint for the Admin (admin-web)
// component. Reachable WITHOUT the admin-session cookie (it is worker-secret
// gated, like /api/sync), so the internal V2 runtime monitor can poll it to
// confirm the Admin is reporting the same mode as the rest of the platform.
//
// Exposes the configured + effective posture of the V2 flags Admin reports
// (global one-device, CORS allowlist) WITHOUT leaking any env values — only
// booleans. Authorization uses assertV2WorkerAuthorized, which checks
// `x-v2-worker-secret` || `x-sync-secret` against V2_WORKER_SECRET ||
// INTERNAL_SYNC_SECRET (fail-closed when unset).

type FlagSummary = { configured: boolean; effective: boolean };

function buildFlagSummary(flagName: string): FlagSummary {
  return {
    configured: isV2FlagConfigured(flagName),
    effective:
      flagName === V2_FLAGS.GLOBAL_ONE_DEVICE_ENABLED
        ? isV2GlobalOneDeviceEnabled()
        : flagName === V2_FLAGS.CORS_ALLOWLIST_ENABLED
          ? isV2CorsAllowlistEnabled()
          : false,
  };
}

async function buildBody() {
  // getRuntimeSnapshot warms the cache internally; isV2Active then reads the
  // resolved snapshot (no extra DB round trip).
  const [snapshot, v2Active] = await Promise.all([
    getRuntimeSnapshot(),
    isV2Active(),
  ]);
  return {
    ok: true,
    component: 'admin',
    activeMode: snapshot.activeMode,
    killSwitch: snapshot.killSwitch,
    source: snapshot.source,
    v2Active,
    flags: {
      globalOneDevice: buildFlagSummary(V2_FLAGS.GLOBAL_ONE_DEVICE_ENABLED),
      corsAllowlist: buildFlagSummary(V2_FLAGS.CORS_ALLOWLIST_ENABLED),
    },
  };
}

export async function GET(request: Request) {
  try {
    assertV2WorkerAuthorized(request);
  } catch (error) {
    const statusCode =
      (error as Error & { statusCode?: number }).statusCode ?? 401;
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: statusCode }
    );
  }
  const body = await buildBody();
  return NextResponse.json(body);
}

export async function POST(request: Request) {
  try {
    assertV2WorkerAuthorized(request);
  } catch (error) {
    const statusCode =
      (error as Error & { statusCode?: number }).statusCode ?? 401;
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: statusCode }
    );
  }
  const body = await buildBody();
  return NextResponse.json(body);
}

// Next.js requires an explicit handler for unsupported methods rather than a
// catch-all, so the route returns 405 for anything that is not GET/POST.
export async function PUT() {
  return NextResponse.json(
    { ok: false, error: 'Method Not Allowed' },
    { status: 405 }
  );
}
export async function DELETE() {
  return NextResponse.json(
    { ok: false, error: 'Method Not Allowed' },
    { status: 405 }
  );
}
export async function PATCH() {
  return NextResponse.json(
    { ok: false, error: 'Method Not Allowed' },
    { status: 405 }
  );
}
