/**
 * Loose Arabic/Latin normalisation used to compare names and headers typed by hand:
 * "أحمد  بن عليّ" ≈ "احمد بن علي", "Prénom" ≈ "prenom".
 */
export function normalize(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // Latin accents
    .replace(/[ً-ٰٟ]/g, '') // Arabic diacritics (tashkil, shadda, dagger alif)
    .replace(/ـ/g, '') // tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLowerCase();
}

/** Identity of a person for duplicate detection. */
export const personKey = (firstName: string, lastName: string, birth?: Date | null) =>
  `${normalize(firstName)}|${normalize(lastName)}|${birth ? birth.toISOString().slice(0, 10) : ''}`;
