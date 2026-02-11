/**
 * Response schema evolution tracking.
 *
 * Tracks response schema consistency across runs and detects when tools
 * return different field structures, enabling schema evolution analysis
 * for drift detection.
 */

import type { InferredSchema } from './response-fingerprint.js';
import { computeInferredSchemaHash } from './response-fingerprint.js';
import { SCHEMA_EVOLUTION } from '../constants.js';

/**
 * Response schema evolution record.
 * Tracks schema stability and inconsistencies across samples.
 */
export interface ResponseSchemaEvolution {
  /** Current schema hash */
  currentHash: string;

  /** Historical schema hashes (most recent first) */
  history: SchemaVersion[];

  /** Whether schema has been stable across all samples */
  isStable: boolean;

  /** Confidence in schema stability (0-1) */
  stabilityConfidence: number;

  /** Fields that appear inconsistently */
  inconsistentFields: string[];

  /** Total number of samples analyzed */
  sampleCount: number;
}

/**
 * A historical schema version.
 */
export interface SchemaVersion {
  /** Schema hash */
  hash: string;

  /** The schema at this version */
  schema: InferredSchema;

  /** When this version was observed */
  observedAt: Date;

  /** Number of samples with this version */
  sampleCount: number;
}

/**
 * Schema comparison result for evolution detection.
 */
export interface SchemaEvolutionDiff {
  /** Whether schema structure changed */
  structureChanged: boolean;

  /** Fields added in new schema */
  fieldsAdded: string[];

  /** Fields removed from schema */
  fieldsRemoved: string[];

  /** Fields with type changes */
  typeChanges: SchemaTypeChange[];

  /** Fields that became required */
  newRequired: string[];

  /** Fields that became optional */
  newOptional: string[];

  /** Backward compatibility assessment */
  backwardCompatible: boolean;

  /** Whether the change is breaking for consumers */
  isBreaking: boolean;

  /** Human-readable summary of changes */
  summary: string;
}

/**
 * A type change for a field.
 */
export interface SchemaTypeChange {
  /** Field path (dot notation for nested fields) */
  field: string;

  /** Previous type */
  previousType: string;

  /** Current type */
  currentType: string;

  /** Whether this change is backward compatible */
  backwardCompatible: boolean;
}

/**
 * Compare two inferred schemas for evolution.
 *
 * @param previous - Previous schema (or undefined if new)
 * @param current - Current schema (or undefined if removed)
 * @returns Detailed comparison result
 */
export function compareInferredSchemas(
  previous: InferredSchema | undefined,
  current: InferredSchema | undefined
): SchemaEvolutionDiff {
  // Both undefined - no change
  if (!previous && !current) {
    return createEmptyDiff();
  }

  // Schema added (new tool or first response)
  if (!previous) {
    const fields = current?.properties ? Object.keys(current.properties) : [];
    return {
      structureChanged: fields.length > 0,
      fieldsAdded: fields,
      fieldsRemoved: [],
      typeChanges: [],
      newRequired: current?.required ?? [],
      newOptional: [],
      backwardCompatible: true, // Adding fields is backward compatible
      isBreaking: false,
      summary:
        fields.length > 0
          ? `Schema established with ${fields.length} field(s)`
          : 'Empty schema established',
    };
  }

  // Schema removed
  if (!current) {
    const fields = previous.properties ? Object.keys(previous.properties) : [];
    return {
      structureChanged: fields.length > 0,
      fieldsAdded: [],
      fieldsRemoved: fields,
      typeChanges: [],
      newRequired: [],
      newOptional: [],
      backwardCompatible: false, // Removing all fields is breaking
      isBreaking: true,
      summary:
        fields.length > 0 ? `Schema removed (${fields.length} field(s) lost)` : 'Schema removed',
    };
  }

  // Both schemas exist - compare them
  return compareSchemaStructures(previous, current);
}

/**
 * Compare two schema structures in detail.
 */
function compareSchemaStructures(
  previous: InferredSchema,
  current: InferredSchema
): SchemaEvolutionDiff {
  const prevFields = new Set(Object.keys(previous.properties ?? {}));
  const currFields = new Set(Object.keys(current.properties ?? {}));

  const fieldsAdded = [...currFields].filter((f) => !prevFields.has(f));
  const fieldsRemoved = [...prevFields].filter((f) => !currFields.has(f));

  // Check for type changes in common fields
  const typeChanges: SchemaTypeChange[] = [];
  for (const field of prevFields) {
    if (currFields.has(field)) {
      const prevProp = previous.properties?.[field];
      const currProp = current.properties?.[field];

      if (prevProp && currProp && prevProp.type !== currProp.type) {
        const isCompatible = isTypeChangeCompatible(prevProp.type, currProp.type);
        typeChanges.push({
          field,
          previousType: prevProp.type,
          currentType: currProp.type,
          backwardCompatible: isCompatible,
        });
      }
    }
  }

  // Check required field changes
  const prevRequired = new Set(previous.required ?? []);
  const currRequired = new Set(current.required ?? []);

  const newRequired = [...currRequired].filter((f) => !prevRequired.has(f) && prevFields.has(f));
  const newOptional = [...prevRequired].filter((f) => !currRequired.has(f) && currFields.has(f));

  const structureChanged =
    fieldsAdded.length > 0 ||
    fieldsRemoved.length > 0 ||
    typeChanges.length > 0 ||
    newRequired.length > 0 ||
    newOptional.length > 0;

  // Backward compatible if:
  // - No fields removed
  // - No breaking type changes
  // - No new required fields on existing fields
  const backwardCompatible =
    fieldsRemoved.length === 0 &&
    typeChanges.every((tc) => tc.backwardCompatible) &&
    newRequired.length === 0;

  // Breaking if:
  // - Fields removed
  // - Breaking type changes
  // - New required fields (consumers may not provide them)
  const isBreaking =
    fieldsRemoved.length > 0 ||
    typeChanges.some((tc) => !tc.backwardCompatible) ||
    newRequired.length > 0;

  // Build summary
  const summary = buildChangeSummary({
    fieldsAdded,
    fieldsRemoved,
    typeChanges,
    newRequired,
    newOptional,
  });

  return {
    structureChanged,
    fieldsAdded,
    fieldsRemoved,
    typeChanges,
    newRequired,
    newOptional,
    backwardCompatible,
    isBreaking,
    summary,
  };
}

/**
 * Check if a type change is backward compatible.
 */
function isTypeChangeCompatible(prevType: string, currType: string): boolean {
  // Widening type changes are compatible (more permissive)
  const wideningChanges: Record<string, string[]> = {
    integer: ['number'], // integer -> number is compatible
    null: ['string', 'number', 'integer', 'boolean', 'object', 'array'], // null -> anything
  };

  if (wideningChanges[prevType]?.includes(currType)) {
    return true;
  }

  // Adding nullable is compatible
  if (prevType !== 'null' && currType === 'mixed') {
    return true;
  }

  return false;
}

/**
 * Build a human-readable summary of schema changes.
 */
function buildChangeSummary(changes: {
  fieldsAdded: string[];
  fieldsRemoved: string[];
  typeChanges: SchemaTypeChange[];
  newRequired: string[];
  newOptional: string[];
}): string {
  const parts: string[] = [];

  if (changes.fieldsRemoved.length > 0) {
    parts.push(`${changes.fieldsRemoved.length} field(s) removed`);
  }

  if (changes.fieldsAdded.length > 0) {
    parts.push(`${changes.fieldsAdded.length} field(s) added`);
  }

  if (changes.typeChanges.length > 0) {
    parts.push(`${changes.typeChanges.length} type change(s)`);
  }

  if (changes.newRequired.length > 0) {
    parts.push(`${changes.newRequired.length} field(s) now required`);
  }

  if (changes.newOptional.length > 0) {
    parts.push(`${changes.newOptional.length} field(s) now optional`);
  }

  if (parts.length === 0) {
    return 'No schema changes';
  }

  return parts.join(', ');
}

/**
 * Create an empty diff result.
 */
function createEmptyDiff(): SchemaEvolutionDiff {
  return {
    structureChanged: false,
    fieldsAdded: [],
    fieldsRemoved: [],
    typeChanges: [],
    newRequired: [],
    newOptional: [],
    backwardCompatible: true,
    isBreaking: false,
    summary: 'No schema changes',
  };
}

/**
 * Build response schema evolution from multiple samples.
 *
 * @param schemas - Array of inferred schemas from samples
 * @returns Schema evolution record
 */
export function buildSchemaEvolution(schemas: InferredSchema[]): ResponseSchemaEvolution {
  if (schemas.length === 0) {
    return {
      currentHash: 'empty',
      history: [],
      isStable: true,
      stabilityConfidence: 0,
      inconsistentFields: [],
      sampleCount: 0,
    };
  }

  // Track field presence across samples
  const fieldPresence = new Map<string, number>();
  const fieldTypes = new Map<string, Set<string>>();

  for (const schema of schemas) {
    if (schema.properties) {
      for (const [field, propSchema] of Object.entries(schema.properties)) {
        fieldPresence.set(field, (fieldPresence.get(field) ?? 0) + 1);

        if (!fieldTypes.has(field)) {
          fieldTypes.set(field, new Set());
        }
        fieldTypes.get(field)!.add(propSchema.type);
      }
    }
  }

  // Find inconsistent fields (not present in all samples or type varies)
  const inconsistentFields: string[] = [];
  for (const [field, count] of fieldPresence) {
    if (count < schemas.length) {
      inconsistentFields.push(field);
    } else if ((fieldTypes.get(field)?.size ?? 0) > 1) {
      inconsistentFields.push(field);
    }
  }

  // Calculate stability
  const totalFields = fieldPresence.size;
  const isStable = inconsistentFields.length === 0;

  // Confidence based on consistency ratio and sample count
  let stabilityConfidence = isStable ? 1 : 1 - inconsistentFields.length / Math.max(1, totalFields);

  // Adjust confidence based on sample count
  // More samples = higher confidence in stability assessment
  const sampleCountFactor = Math.min(
    1,
    schemas.length / SCHEMA_EVOLUTION.HIGH_CONFIDENCE_MIN_SAMPLES
  );
  stabilityConfidence = stabilityConfidence * sampleCountFactor;

  // Build history (most recent schema)
  const currentSchema = schemas[schemas.length - 1];
  const currentHash = computeInferredSchemaHash(currentSchema);

  const history: SchemaVersion[] = [
    {
      hash: currentHash,
      schema: currentSchema,
      observedAt: new Date(),
      sampleCount: schemas.length,
    },
  ];

  return {
    currentHash,
    history,
    isStable,
    stabilityConfidence: Math.round(stabilityConfidence * 100) / 100,
    inconsistentFields: inconsistentFields.sort(),
    sampleCount: schemas.length,
  };
}

/**
 * Compare schema evolution records between baselines.
 *
 * @param previous - Previous schema evolution
 * @param current - Current schema evolution
 * @returns Evolution comparison result
 */
export function compareSchemaEvolution(
  previous: ResponseSchemaEvolution | undefined,
  current: ResponseSchemaEvolution | undefined
): SchemaEvolutionDiff {
  // Handle missing evolution records
  if (!previous && !current) {
    return createEmptyDiff();
  }

  if (!previous) {
    return {
      ...createEmptyDiff(),
      structureChanged:
        (current?.inconsistentFields.length ?? 0) > 0 || current?.currentHash !== 'empty',
      summary: current?.isStable
        ? 'Schema tracking established (stable)'
        : `Schema tracking established (${current?.inconsistentFields.length ?? 0} inconsistent field(s))`,
    };
  }

  if (!current) {
    return {
      ...createEmptyDiff(),
      structureChanged: true,
      isBreaking: true,
      backwardCompatible: false,
      summary: 'Schema evolution data removed',
    };
  }

  // Compare current schemas if available
  const prevSchema = previous.history[0]?.schema;
  const currSchema = current.history[0]?.schema;

  if (prevSchema && currSchema) {
    return compareInferredSchemas(prevSchema, currSchema);
  }

  // Compare hashes directly
  if (previous.currentHash !== current.currentHash) {
    return {
      ...createEmptyDiff(),
      structureChanged: true,
      summary: 'Schema hash changed',
    };
  }

  // Check stability change
  if (previous.isStable !== current.isStable) {
    return {
      ...createEmptyDiff(),
      structureChanged: false,
      summary: current.isStable ? 'Schema stabilized' : 'Schema became unstable',
    };
  }

  return createEmptyDiff();
}

/**
 * Format schema evolution for display.
 *
 * @param evolution - Schema evolution record
 * @returns Formatted string representation
 */
export function formatSchemaEvolution(evolution: ResponseSchemaEvolution): string {
  const lines: string[] = [];

  const stabilityIcon = evolution.isStable ? 'stable' : 'unstable';
  const confidencePercent = Math.round(evolution.stabilityConfidence * 100);

  lines.push(
    `${stabilityIcon} Schema ${evolution.isStable ? 'Stable' : 'Unstable'} (${confidencePercent}% confidence)`
  );

  if (evolution.sampleCount > 0) {
    lines.push(`  Samples: ${evolution.sampleCount}`);
    lines.push(`  Hash: ${evolution.currentHash}`);
  }

  if (evolution.inconsistentFields.length > 0) {
    const fieldsDisplay =
      evolution.inconsistentFields.length <= 3
        ? evolution.inconsistentFields.join(', ')
        : `${evolution.inconsistentFields.slice(0, 3).join(', ')} +${evolution.inconsistentFields.length - 3} more`;
    lines.push(`  Inconsistent fields: ${fieldsDisplay}`);
  }

  return lines.join('\n');
}

/**
 * Format schema evolution diff for display.
 *
 * @param diff - Schema evolution diff
 * @param useColors - Whether to use ANSI colors
 * @returns Formatted string representation
 */
export function formatSchemaEvolutionDiff(
  diff: SchemaEvolutionDiff,
  useColors: boolean = true
): string[] {
  const lines: string[] = [];
  const { red, green, yellow } = useColors ? colors : noColors;

  if (!diff.structureChanged) {
    return [];
  }

  if (diff.fieldsRemoved.length > 0) {
    lines.push(
      red(`  ${diff.fieldsRemoved.length} field(s) removed: ${diff.fieldsRemoved.join(', ')}`)
    );
  }

  if (diff.fieldsAdded.length > 0) {
    lines.push(
      green(`  ${diff.fieldsAdded.length} field(s) added: ${diff.fieldsAdded.join(', ')}`)
    );
  }

  for (const tc of diff.typeChanges) {
    const changeColor = tc.backwardCompatible ? yellow : red;
    lines.push(changeColor(`  Type change: ${tc.field}: ${tc.previousType} → ${tc.currentType}`));
  }

  if (diff.newRequired.length > 0) {
    lines.push(red(`  Now required: ${diff.newRequired.join(', ')}`));
  }

  if (diff.newOptional.length > 0) {
    lines.push(green(`  Now optional: ${diff.newOptional.join(', ')}`));
  }

  return lines;
}

/**
 * Determine if schema evolution indicates breaking changes.
 *
 * @param evolution - Schema evolution record
 * @param threshold - Confidence threshold for stability
 * @returns Whether the schema evolution indicates issues
 */
export function hasSchemaEvolutionIssues(
  evolution: ResponseSchemaEvolution,
  threshold: number = SCHEMA_EVOLUTION.STABILITY_THRESHOLD
): boolean {
  // Unstable schema with high sample count is concerning
  if (!evolution.isStable && evolution.sampleCount >= SCHEMA_EVOLUTION.MIN_SAMPLES_FOR_STABILITY) {
    return true;
  }

  // Low stability confidence with enough samples
  if (
    evolution.stabilityConfidence < threshold &&
    evolution.sampleCount >= SCHEMA_EVOLUTION.MIN_SAMPLES_FOR_STABILITY
  ) {
    return true;
  }

  return false;
}

/**
 * Get schema evolution stability grade.
 *
 * @param evolution - Schema evolution record
 * @returns Grade from A-F
 */
export function getSchemaStabilityGrade(
  evolution: ResponseSchemaEvolution
): 'A' | 'B' | 'C' | 'D' | 'F' | 'N/A' {
  if (evolution.sampleCount < SCHEMA_EVOLUTION.MIN_SAMPLES_FOR_STABILITY) {
    return 'N/A';
  }

  const confidence = evolution.stabilityConfidence;
  const { A, B, C, D } = SCHEMA_EVOLUTION.GRADE_THRESHOLDS;

  if (evolution.isStable && confidence >= A) return 'A';
  if (confidence >= B) return 'B';
  if (confidence >= C) return 'C';
  if (confidence >= D) return 'D';
  return 'F';
}

// Color utilities
const colors = {
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
};

const noColors = {
  red: (s: string) => s,
  green: (s: string) => s,
  yellow: (s: string) => s,
};
