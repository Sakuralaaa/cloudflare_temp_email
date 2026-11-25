import { describe, expect, it } from 'vitest'
import { extractLocalOtp } from '../otp-extract'

describe('extractLocalOtp', () => {
  it('extracts Chinese verification codes', () => {
    expect(extractLocalOtp('登录验证码', '您的验证码是：482910，5分钟内有效。')).toBe('482910')
    expect(extractLocalOtp('安全提醒', '本次操作安全码: 【7391】请勿泄露')).toBe('7391')
    expect(extractLocalOtp('你的 ChatGPT 代码为 654966', '输入此临时验证码以继续：654966')).toBe('654966')
  })

  it('extracts English OTP codes', () => {
    expect(extractLocalOtp('Verify your email', 'Your verification code is 654321.')).toBe('654321')
    expect(extractLocalOtp('Sign in', '839204 is your login code for Acme.')).toBe('839204')
    expect(extractLocalOtp('Your OTP', 'Use code: 123-456 to continue')).toBe('123456')
  })

  it('extracts standalone code on its own line when subject mentions verification', () => {
    expect(
      extractLocalOtp('Verification code for OpenAI', 'Enter the following code:\n\n908172\n\nValid for 10 minutes.')
    ).toBe('908172')
  })

  it('ignores non-OTP emails and URLs', () => {
    expect(extractLocalOtp('Order #20261125', 'Thank you for your order 123456 on 2026.')).toBeNull()
    expect(extractLocalOtp('Verification code', 'Visit https://example.com/verify?code=999999 now')).toBeNull()
  })
})
