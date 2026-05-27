/**
 * Converts a FileMaker field name to a lowerCamelCase input parameter name.
 *
 * Examples:
 *   "EmailAddress"   → "emailAddress"
 *   "First Name"     → "firstName"
 *   "CUSTOMER_ID"    → "customerId"
 *   "Phone_Number"   → "phoneNumber"
 *   "date_of_birth"  → "dateOfBirth"
 *   "ZIP"            → "zip"
 */
export function fmFieldToParamName(fmFieldName: string): string {
  return fmFieldName
    // Split PascalCase boundaries: "EmailAddress" → "Email Address"
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    // Split consecutive uppercase followed by mixed case: "ABBRWord" → "ABBR Word"
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    // Split on spaces, underscores, hyphens
    .split(/[\s_\-]+/)
    .filter(Boolean)
    .map((word, index) =>
      index === 0
        ? word.toLowerCase()
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    )
    .join('')
}
