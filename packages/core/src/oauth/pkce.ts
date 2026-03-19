export interface PKCEPair {
    verifier: string;
    challenge: string;
}

/**
 * Generate a PKCE verifier and S256 challenge.
 * Uses the Web Crypto API (available in Node 19+ and all modern browsers).
 */
export async function generatePKCE(): Promise<PKCEPair> {
    // Generate a cryptographically random 32-byte verifier
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    const verifier = base64UrlEncode(array);

    // SHA-256 hash the verifier to produce the challenge
    const encoded = new TextEncoder().encode(verifier);
    const digest = await crypto.subtle.digest("SHA-256", encoded);
    const challenge = base64UrlEncode(new Uint8Array(digest));

    return { verifier, challenge };
}

function base64UrlEncode(bytes: Uint8Array): string {
    return btoa(String.fromCharCode(...bytes))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}
