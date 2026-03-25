import { NextResponse } from 'next/server'

export type ApiErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'VALIDATION_ERROR'
  | 'RATE_LIMITED'
  | 'DEPENDENCY_FAILURE'
  | 'TIMEOUT'
  | 'NOT_FOUND'
  | 'INTERNAL_ERROR'

export interface ApiResponseMeta {
  requestId: string
  timestamp: string
}

interface ApiSuccessInit {
  status?: number
  headers?: HeadersInit
  meta: ApiResponseMeta
}

interface ApiErrorInit {
  status: number
  headers?: HeadersInit
  details?: unknown
  meta: ApiResponseMeta
}

export function createApiMeta(): ApiResponseMeta {
  return {
    requestId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
  }
}

export function apiSuccess<T>(data: T, init: ApiSuccessInit) {
  return NextResponse.json(
    {
      ok: true,
      data,
      error: null,
      meta: init.meta,
    },
    {
      status: init.status ?? 200,
      headers: init.headers,
    }
  )
}

export function apiError(code: ApiErrorCode, message: string, init: ApiErrorInit) {
  return NextResponse.json(
    {
      ok: false,
      data: null,
      error: {
        code,
        message,
        ...(init.details !== undefined ? { details: init.details } : {}),
      },
      meta: init.meta,
    },
    {
      status: init.status,
      headers: init.headers,
    }
  )
}
