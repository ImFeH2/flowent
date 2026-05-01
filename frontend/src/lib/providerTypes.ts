export const providerTypeOptions: Array<{ value: string; label: string }> = [
  { value: "openai_compatible", label: "OpenAI Compatible" },
  { value: "openai_responses", label: "OpenAI Response" },
  { value: "anthropic", label: "Anthropic" },
  { value: "gemini", label: "Gemini" },
];

const providerTypeMap = Object.fromEntries(
  providerTypeOptions.map((item) => [item.value, item.label]),
);

export function providerTypeLabel(value: string): string {
  return providerTypeMap[value] ?? value;
}
