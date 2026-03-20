export function findSelectOptions(html: string, keyword: string) {
  const selectRegex = /<select([^>]*)>([\s\S]*?)<\/select>/gi;
  let match: RegExpExecArray | null;
  while ((match = selectRegex.exec(html))) {
    const attrs = match[1] || '';
    if (attrs.toLowerCase().includes(keyword.toLowerCase())) {
      return extractOptions(match[2] || '');
    }
  }
  return [] as { value: string; label: string }[];
}

export function extractOptions(optionsHtml: string) {
  const options: { value: string; label: string }[] = [];
  const optionRegex = /<option[^>]*value="([^"]*)"[^>]*>([^<]*)<\/option>/gi;
  let optMatch: RegExpExecArray | null;
  while ((optMatch = optionRegex.exec(optionsHtml))) {
    const value = optMatch[1]?.trim() ?? '';
    const label = optMatch[2]?.trim() ?? '';
    options.push({ value, label });
  }
  return options;
}

export function pickNonPlaceholder(options: { value: string; label: string }[], preferred?: string) {
  const filtered = options.filter(opt => {
    const label = opt.label.toLowerCase();
    return opt.value && !label.includes('select') && label !== '---select---';
  });
  if (preferred) {
    const preferredOpt = filtered.find(opt => opt.label.toLowerCase().includes(preferred.toLowerCase()));
    if (preferredOpt) return preferredOpt;
  }
  return filtered[0] ?? options[0] ?? null;
}
