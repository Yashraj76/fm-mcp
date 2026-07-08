/**
 * Pure validation for schema selections (PUT /api/connections/[id]/schema/selections).
 *
 * Two invariants are enforced:
 *
 *   NO_SELECTIONS       — selectedLayouts and selectedTables are both empty.
 *                         Saving an empty schema would erase existing valid selections.
 *
 *   INVALID_TABLE_NAMES — one or more selected OData tables are not in the list that was
 *                         fetched from the server (rawODataTables).  This prevents saving
 *                         a stale or hand-crafted table name that the executor can never
 *                         route to.
 *
 * No DB access, no Next.js.  Pass the three arrays in; get a result back.
 */

export type SelectionValidationErrorCode = 'NO_SELECTIONS' | 'INVALID_TABLE_NAMES'

export interface SelectionValidationError {
  code: SelectionValidationErrorCode
  message: string
  /** The form field the error is attached to — for inline display. */
  field: 'selectedLayouts' | 'selectedTables'
  /** Only present for INVALID_TABLE_NAMES. */
  invalidNames?: string[]
}

export interface SelectionValidationResult {
  valid: boolean
  errors: SelectionValidationError[]
}

/**
 * Validate a schema selection payload before persisting it.
 *
 * @param selectedLayouts      Layout names the user ticked.
 * @param selectedTables       OData table names the user ticked.
 * @param availableODataTables Tables that were actually fetched from the server
 *                             (parsed from BrowsedSchema.rawODataTables).
 */
export function validateSchemaSelections(
  selectedLayouts: string[],
  selectedTables: string[],
  availableODataTables: string[],
): SelectionValidationResult {
  const errors: SelectionValidationError[] = []

  if (selectedLayouts.length === 0 && selectedTables.length === 0) {
    errors.push({
      code: 'NO_SELECTIONS',
      message: 'Select at least one layout or OData table before saving.',
      field: 'selectedLayouts',
    })
  }

  if (selectedTables.length > 0) {
    const available = new Set(availableODataTables)
    const invalidNames = selectedTables.filter(t => !available.has(t))
    if (invalidNames.length > 0) {
      errors.push({
        code: 'INVALID_TABLE_NAMES',
        message:
          `The following OData tables were not found in the fetched schema: ${invalidNames.join(', ')}. ` +
          `Remove them or re-browse the schema to refresh the available tables.`,
        field: 'selectedTables',
        invalidNames,
      })
    }
  }

  return { valid: errors.length === 0, errors }
}
