/**
 * Lightweight client-side verification code (OTP) extractor.
 * Used as a fast fallback when backend AI extraction metadata is unavailable.
 */

const OTP_KEYWORD_PATTERN =
  /(?:验证码|校验码|动态码|安全码|认证码|确认码|登录码|激活码|口令|代码|verification\s*code|security\s*code|passcode|one[- ]?time\s*(?:password|passcode|code)|auth(?:entication)?\s*code|login\s*code|sign[- ]?in\s*code|confirm(?:ation)?\s*code|pin\s*code|\botp\b|\b2fa\b|\bcode\b)/i

// Explicit patterns where a code immediately follows or precedes an OTP keyword
const DIRECT_CODE_PATTERNS: RegExp[] = [
  // Chinese / English keyword followed by optional punctuation/verb and a 4-8 digit or mixed code
  /(?:验证码|校验码|动态码|安全码|认证码|确认码|登录码|激活码|代码|verification\s*code|security\s*code|passcode|one[- ]?time\s*(?:password|passcode|code)|auth(?:entication)?\s*code|login\s*code|sign[- ]?in\s*code|confirm(?:ation)?\s*code|\botp\b|\bcode\b)\s*(?:is|for\s+[^:\n]{1,30}is|为|是)?\s*[:：#\-—]?\s*[\[\(【「"'\*]*([0-9]{4,8}|[0-9]{3}[-\s][0-9]{3})[\]\)】」"'\*]*/i,
  // Code immediately followed by "is your verification/security code"
  /\b([0-9]{4,8}|[0-9]{3}[-\s][0-9]{3})\b\s+(?:is\s+your\s+(?:verification|security|login|sign[- ]?in|confirmation|one[- ]?time|auth(?:entication)?|email)?\s*(?:code|passcode|pin|otp)|为您的(?:验证码|校验码|安全码|动态码)|是您的(?:验证码|校验码|安全码|动态码))/i,
  // Alphanumeric 6-8 char uppercase code right after explicit code colon (must contain at least 1 digit)
  /(?:验证码|校验码|verification\s*code|security\s*code|passcode|\botp\b)\s*[:：]\s*([A-Z0-9]{5,8})\b/i,
]

function normalizeCode(raw: string): string {
  return raw.replace(/[\s-]/g, '').trim()
}

function isLikelyYearOrNoise(code: string): boolean {
  if (/^(19|20)\d{2}$/.test(code)) return true
  if (/^0+$/.test(code)) return true
  return false
}

export function extractLocalOtp(subject?: string | null, text?: string | null): string | null {
  const safeSubject = (subject || '').trim()
  const safeText = (text || '').trim()
  const combined = `${safeSubject}\n${safeText}`.trim()
  if (!combined) return null

  // Must contain at least one OTP-related keyword to avoid false positives on order numbers / years
  if (!OTP_KEYWORD_PATTERN.test(combined)) {
    return null
  }

  // Strip URLs so query tokens/IDs inside links aren't misread as OTPs
  const stripped = combined
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, ' ')

  for (const pattern of DIRECT_CODE_PATTERNS) {
    const match = stripped.match(pattern)
    if (match?.[1]) {
      const candidate = normalizeCode(match[1])
      if (candidate.length >= 4 && candidate.length <= 8 && /\d/.test(candidate) && !isLikelyYearOrNoise(candidate)) {
        return candidate
      }
    }
  }

  // Secondary check: if subject has OTP keyword, look for a standalone 4-8 digit number on its own line in the first 600 chars of body
  if (OTP_KEYWORD_PATTERN.test(safeSubject)) {
    const head = stripped.slice(0, 700)
    const standalone = head.match(/(?:^|\n)\s*([0-9]{4,8}|[0-9]{3}[-\s][0-9]{3})\s*(?:\n|$)/)
    if (standalone?.[1]) {
      const candidate = normalizeCode(standalone[1])
      if (candidate.length >= 4 && candidate.length <= 8 && !isLikelyYearOrNoise(candidate)) {
        return candidate
      }
    }
  }

  return null
}
