export function parseBooleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

export function getDefaultAllowRegister(): boolean {
  return parseBooleanEnv(process.env.ALLOW_REGISTER, true);
}

export function resolveAllowRegister(configValue: unknown, fallback: boolean): boolean {
  if (typeof configValue === "boolean") return configValue;
  return fallback;
}

export function isRegistrationClosed(allowRegister: boolean): boolean {
  return !allowRegister;
}
