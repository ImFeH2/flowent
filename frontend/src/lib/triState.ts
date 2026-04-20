export type TriStateCapability = "auto" | "enabled" | "disabled";

export function triStateFromNullableBool(
  value: boolean | null,
): TriStateCapability {
  if (value === true) {
    return "enabled";
  }
  if (value === false) {
    return "disabled";
  }
  return "auto";
}

export function nullableBoolFromTriState(
  value: TriStateCapability,
): boolean | null {
  if (value === "enabled") {
    return true;
  }
  if (value === "disabled") {
    return false;
  }
  return null;
}
