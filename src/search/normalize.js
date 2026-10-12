// Shared by the search engine and scripts/build-data.mjs so indexed text and queries fold identically.
const FOLD = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' };

export function normalize(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[äöüß]/g, c => FOLD[c])
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
