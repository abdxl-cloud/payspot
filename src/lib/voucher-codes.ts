import { randomBytes, randomUUID } from "node:crypto";

export const CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
export const CODE_NUMBERS = "23456789";
export const CODE_ALPHABET = `${CODE_LETTERS}${CODE_NUMBERS}`;
export const MIN_CODE_LENGTH = 6;
export const MAX_CODE_LENGTH = 24;
export const MAX_PREFIX_LENGTH = 16;

export type CodeCharacterSet = "alnum" | "letters" | "numbers";

export type RadiusVoucherCodeConfig = {
  prefix?: string | null;
  codeLength?: number | null;
  characterSet?: CodeCharacterSet | null;
};

export function resolveCodeAlphabet(characterSet: CodeCharacterSet) {
  if (characterSet === "letters") return CODE_LETTERS;
  if (characterSet === "numbers") return CODE_NUMBERS;
  return CODE_ALPHABET;
}

export function randomCode(length: number, alphabet = CODE_ALPHABET) {
  const bytes = randomBytes(length);
  let code = "";
  for (let i = 0; i < length; i += 1) {
    code += alphabet[bytes[i] % alphabet.length];
  }
  return code;
}

export function buildLegacyGeneratedVoucherCode() {
  return `PS-${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

export function buildConfiguredVoucherCode(config: {
  prefix?: string | null;
  codeLength: number;
  characterSet: CodeCharacterSet;
}) {
  const prefix = config.prefix?.trim().toUpperCase() || "";
  const suffix = randomCode(config.codeLength, resolveCodeAlphabet(config.characterSet));
  return prefix ? `${prefix}-${suffix}` : suffix;
}

export function buildRadiusVoucherCode(config?: RadiusVoucherCodeConfig | null) {
  const codeLength = config?.codeLength ?? null;
  const characterSet = config?.characterSet ?? null;
  if (
    !config ||
    !characterSet ||
    typeof codeLength !== "number" ||
    !Number.isFinite(codeLength) ||
    codeLength < MIN_CODE_LENGTH ||
    codeLength > MAX_CODE_LENGTH
  ) {
    return buildLegacyGeneratedVoucherCode();
  }

  return buildConfiguredVoucherCode({
    prefix: config.prefix,
    codeLength: Math.round(codeLength),
    characterSet,
  });
}
