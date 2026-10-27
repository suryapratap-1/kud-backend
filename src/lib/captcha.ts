import { env } from "@/env";

/**
 * Verifies a Cloudflare Turnstile token. Without TURNSTILE_SECRET_KEY the check is off (local development).
 * Fails closed: if Cloudflare can't be reached, the submission is refused rather than let through unchecked.
 */
export async function verifyCaptcha(token: string | null, ip: string) {
  const secret = env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;

  const body = new URLSearchParams({ secret, response: token });
  if (ip !== "unknown") body.set("remoteip", ip);
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
      signal: AbortSignal.timeout(5000),
    });
    const result = (await response.json()) as { success: boolean };
    return result.success === true;
  } catch (error) {
    console.error("Turnstile verification failed", error);
    return false;
  }
}
