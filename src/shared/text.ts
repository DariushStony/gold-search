// Persian and Arabic digits to ASCII, Arabic letters to Persian, ZWNJ to space and decimal marks to «.».
export function normalize(s: string): string {
  return s
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/‌/g, ' ')
    .replace(/(\d)٬(\d)/g, '$1$2')
    .replace(/(\d)\s*[٫/]\s*(\d)/g, '$1.$2')
    .replace(/\s+/g, ' ')
    .trim();
}
