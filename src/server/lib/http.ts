import type { Context } from 'hono'
import type { ZodIssue, ZodType } from 'zod'

export type ApiFieldError = {
  /** Path segments are safer and easier for a form to map than server prose. */
  path: string[]
  /** A stable, presentation-free validation rule identifier. */
  code: string
}

export type ApiErrorBody = {
  error: {
    code: string
    message: string
    fieldErrors?: ApiFieldError[]
  }
}

export function errorResponse(
  context: Context,
  status: 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500,
  code: string,
  message: string,
  fieldErrors?: ApiFieldError[],
) {
  return context.json<ApiErrorBody>({ error: { code, message, ...(fieldErrors?.length ? { fieldErrors } : {}) } }, status)
}

function safeIssueCode(issue: ZodIssue): string {
  if (issue.code === 'custom') return 'invalid'
  if (issue.code === 'too_small') return issue.minimum === 1 ? 'required' : 'too_small'
  if (issue.code === 'too_big') return 'too_large'
  if (issue.code === 'invalid_format') return 'invalid_format'
  if (issue.code === 'invalid_type') return 'invalid_type'
  if (issue.code === 'invalid_value') return 'invalid_value'
  return 'invalid'
}

/**
 * Zod messages often contain implementation detail and occasionally embed a
 * supplied value. The API intentionally exposes only a path and a small safe
 * code; the client owns localized, conversion-friendly wording.
 */
export function fieldErrorsFromZodIssues(issues: ZodIssue[]): ApiFieldError[] {
  const seen = new Set<string>()
  return issues.flatMap((issue) => {
    const path = issue.path.map(String)
    const code = safeIssueCode(issue)
    const key = `${path.join('.')}|${code}`
    if (seen.has(key)) return []
    seen.add(key)
    return [{ path, code }]
  })
}

export async function parseJson<T>(context: Context, schema: ZodType<T>) {
  let payload: unknown

  try {
    payload = await context.req.json<unknown>()
  } catch {
    return { success: false as const, response: errorResponse(context, 400, 'invalid_json', 'Invalid JSON body.') }
  }

  const parsed = schema.safeParse(payload)
  if (!parsed.success) {
    return {
      success: false as const,
      response: errorResponse(
        context,
        422,
        'invalid_input',
        'Please check the submitted information.',
        fieldErrorsFromZodIssues(parsed.error.issues),
      ),
    }
  }

  return { success: true as const, data: parsed.data }
}

/**
 * Browser forms using a session cookie must originate from this storefront.
 * Requests without an Origin header are allowed for non-browser clients.
 */
export function hasTrustedOrigin(context: Context) {
  const origin = context.req.header('origin')
  return origin === undefined || origin === new URL(context.req.url).origin
}

export function canonicalEmail(email: string) {
  return email.trim().toLocaleLowerCase('en-US')
}
