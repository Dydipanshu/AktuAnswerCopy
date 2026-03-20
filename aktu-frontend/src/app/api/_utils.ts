import { NextResponse } from 'next/server';
import crypto from 'crypto';

export type ApiErrorPayload = {
  code: string;
  message: string;
  detail?: string;
  hint?: string;
  requestId: string;
};

export function makeRequestId() {
  return crypto.randomUUID();
}

export function jsonError(
  code: string,
  message: string,
  status: number,
  opts?: { detail?: string; hint?: string; requestId?: string }
) {
  const requestId = opts?.requestId ?? makeRequestId();
  const error: ApiErrorPayload = {
    code,
    message,
    detail: opts?.detail,
    hint: opts?.hint,
    requestId,
  };
  return NextResponse.json(
    { ok: false, error },
    { status, headers: { 'x-request-id': requestId } }
  );
}

export function jsonOk<T extends Record<string, unknown>>(data: T, requestId?: string) {
  const id = requestId ?? makeRequestId();
  return NextResponse.json(
    { ok: true, ...data, requestId: id },
    { headers: { 'x-request-id': id } }
  );
}
