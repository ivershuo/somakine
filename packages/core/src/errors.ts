export type ValidationCode =
  | "invalid_type"
  | "invalid_value"
  | "invalid_id"
  | "duplicate_id"
  | "broken_reference"
  | "unsafe_asset_uri"
  | "missing_provenance"
  | "invalid_coverage"
  | "invalid_laterality"
  | "invalid_extension"
  | "extension_conflict"
  | "unsupported_schema";

export interface ValidationIssue {
  code: ValidationCode;
  path: string;
  message: string;
}

export class DataPackValidationError extends Error {
  readonly issues: readonly ValidationIssue[];

  constructor(issues: readonly ValidationIssue[]) {
    super(`Somakine data pack validation failed with ${issues.length} issue(s)`);
    this.name = "DataPackValidationError";
    this.issues = issues;
  }
}

export class DataExtensionValidationError extends Error {
  readonly issues: readonly ValidationIssue[];

  constructor(issues: readonly ValidationIssue[]) {
    super(`Somakine data extension validation failed with ${issues.length} issue(s): ${issues[0]?.message ?? "unknown issue"}`);
    this.name = "DataExtensionValidationError";
    this.issues = issues;
  }
}
