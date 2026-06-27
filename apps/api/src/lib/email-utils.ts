/**
 * Email parsing and matching utilities for client assignment
 */

/**
 * Extract email addresses from a header string (handles "Name <email@domain.com>" format)
 */
export function extractEmailsFromHeader(header: string): string[] {
  if (!header) return [];

  const emailRegex = /[\w.-]+@[\w.-]+\.\w+/g;
  return header.match(emailRegex) || [];
}

/**
 * Extract all email addresses from Gmail headers
 */
export function extractAllEmails(headers: Array<{ name?: string | null; value?: string | null }>): string[] {
  const fromHeader = headers.find((h) => h.name === "From")?.value ?? "";
  const toHeader = headers.find((h) => h.name === "To")?.value ?? "";
  const ccHeader = headers.find((h) => h.name === "Cc")?.value ?? "";
  const bccHeader = headers.find((h) => h.name === "Bcc")?.value ?? "";

  const allEmails = [
    ...extractEmailsFromHeader(fromHeader),
    ...extractEmailsFromHeader(toHeader),
    ...extractEmailsFromHeader(ccHeader),
    ...extractEmailsFromHeader(bccHeader),
  ].map(email => email.toLowerCase());

  // Remove duplicates
  return [...new Set(allEmails)];
}

/**
 * Check if an email list matches a client's email domain specification
 *
 * @param emails - Array of email addresses found in the document
 * @param clientEmailDomain - Client's email domain specification
 * @returns true if there's a match
 */
export function matchesClientEmail(emails: string[], clientEmailDomain: string): boolean {
  if (!clientEmailDomain || emails.length === 0) return false;

  const cleanClientDomain = clientEmailDomain.toLowerCase().trim();

  // Check if client emailDomain is a full email address or just domain
  if (cleanClientDomain.includes('@')) {
    // It's a specific email address - exact match required
    return emails.includes(cleanClientDomain);
  } else {
    // It's a domain - match any email with this domain
    // Support various domain formats: "company.com", "@company.com"
    const cleanDomain = cleanClientDomain.replace(/^@/, ''); // Remove leading @ if present

    return emails.some(email => email.endsWith(`@${cleanDomain}`));
  }
}

/**
 * Find the matching client ID for a set of email addresses
 *
 * @param emails - Array of email addresses found in the document
 * @param clients - Array of clients with their email domains
 * @returns clientId if match found, null otherwise
 */
export function findMatchingClientId(
  emails: string[],
  clients: Array<{ id: string; emailDomain: string | null }>
): string | null {
  for (const client of clients) {
    if (!client.emailDomain) continue;

    if (matchesClientEmail(emails, client.emailDomain)) {
      return client.id;
    }
  }

  return null;
}