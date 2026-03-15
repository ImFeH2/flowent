import type { ModelParams } from "@/types";

export const EMPTY_MODEL_PARAMS: ModelParams = {
  reasoning_effort: null,
  verbosity: null,
  max_output_tokens: null,
  temperature: null,
  top_p: null,
};

export function cloneModelParams(
  params: ModelParams | null | undefined,
): ModelParams {
  return {
    reasoning_effort: params?.reasoning_effort ?? null,
    verbosity: params?.verbosity ?? null,
    max_output_tokens: params?.max_output_tokens ?? null,
    temperature: params?.temperature ?? null,
    top_p: params?.top_p ?? null,
  };
}

export function isEmptyModelParams(params: ModelParams | null | undefined) {
  return (
    !params ||
    ((params.reasoning_effort ?? null) === null &&
      (params.verbosity ?? null) === null &&
      (params.max_output_tokens ?? null) === null &&
      (params.temperature ?? null) === null &&
      (params.top_p ?? null) === null)
  );
}

export function modelParamsToPayload(params: ModelParams | null | undefined) {
  return isEmptyModelParams(params) ? null : cloneModelParams(params);
}

export function describeModelParams(params: ModelParams | null | undefined) {
  if (isEmptyModelParams(params)) {
    return "Inherit settings defaults";
  }

  const parts: string[] = [];
  if (params?.reasoning_effort) {
    parts.push(`Reasoning ${params.reasoning_effort}`);
  }
  if (params?.verbosity) {
    parts.push(`Verbosity ${params.verbosity}`);
  }
  if (
    params?.max_output_tokens !== null &&
    params?.max_output_tokens !== undefined
  ) {
    parts.push(`Max ${params.max_output_tokens}`);
  }
  if (params?.temperature !== null && params?.temperature !== undefined) {
    parts.push(`Temp ${params.temperature}`);
  }
  if (params?.top_p !== null && params?.top_p !== undefined) {
    parts.push(`Top-p ${params.top_p}`);
  }

  return parts.join(" · ");
}
