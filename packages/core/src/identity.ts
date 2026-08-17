export type EntityId = number;
export type Guid = string;
export const GUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function guid(): Guid {
  return crypto.randomUUID();
}
export function assertGuid(value: string): void {
  if (!GUID_PATTERN.test(value)) throw new Error(`Invalid GUID: ${value}`);
}
