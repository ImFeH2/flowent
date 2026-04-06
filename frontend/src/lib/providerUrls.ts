const providerVersionSuffixes: Record<string, string> = {
  openai_compatible: "/v1",
  openai_responses: "/v1",
  anthropic: "/v1",
  gemini: "/v1beta",
};

const providerRequestPaths: Record<string, string> = {
  openai_compatible: "/chat/completions",
  openai_responses: "/responses",
  anthropic: "/messages",
  gemini: "/models/{model}:streamGenerateContent",
};

const knownSuffixes = Array.from(
  new Set(Object.values(providerVersionSuffixes)),
).sort((left, right) => right.length - left.length);

function normalizeProviderType(providerType: string): string {
  return providerType.trim().toLowerCase();
}

function trimBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

export function resolveProviderBaseUrl(
  providerType: string,
  baseUrl: string,
): { resolvedBaseUrl: string | null; error: string | null } {
  const normalizedType = normalizeProviderType(providerType);
  const expectedSuffix = providerVersionSuffixes[normalizedType];
  const normalizedBaseUrl = trimBaseUrl(baseUrl);

  if (!expectedSuffix || !normalizedBaseUrl) {
    return { resolvedBaseUrl: null, error: null };
  }

  const lowerBaseUrl = normalizedBaseUrl.toLowerCase();

  for (const suffix of knownSuffixes) {
    if (!lowerBaseUrl.endsWith(suffix)) {
      continue;
    }
    if (suffix !== expectedSuffix) {
      return {
        resolvedBaseUrl: null,
        error: `Base URL suffix '${suffix}' does not match type '${normalizedType}' (expected '${expectedSuffix}')`,
      };
    }
    return { resolvedBaseUrl: normalizedBaseUrl, error: null };
  }

  return {
    resolvedBaseUrl: `${normalizedBaseUrl}${expectedSuffix}`,
    error: null,
  };
}

export function buildProviderRequestPreview(
  providerType: string,
  baseUrl: string,
): { previewUrl: string | null; error: string | null } {
  const normalizedType = normalizeProviderType(providerType);
  const requestPath = providerRequestPaths[normalizedType];
  const { resolvedBaseUrl, error } = resolveProviderBaseUrl(
    normalizedType,
    baseUrl,
  );

  if (error) {
    return { previewUrl: null, error };
  }
  if (!resolvedBaseUrl || !requestPath) {
    return { previewUrl: null, error: null };
  }

  return {
    previewUrl: `${resolvedBaseUrl}${requestPath}`,
    error: null,
  };
}
