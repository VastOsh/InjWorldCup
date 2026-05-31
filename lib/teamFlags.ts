// Maps team names to flagcdn.com country codes.
// Subdivision flags (e.g. gb-eng) are supported by flagcdn.com.
// Add entries here as new teams are seeded in the matches table.
const TEAM_FLAGS: Record<string, string> = {
  // Americas
  "Brazil":        "br",
  "Argentina":     "ar",
  "USA":           "us",
  "Mexico":        "mx",
  "Uruguay":       "uy",
  "Colombia":      "co",
  "Ecuador":       "ec",
  "Chile":         "cl",
  "Canada":        "ca",
  "Paraguay":      "py",
  "Peru":          "pe",
  "Bolivia":       "bo",
  "Costa Rica":    "cr",
  "Panama":        "pa",
  "Honduras":      "hn",
  "Jamaica":       "jm",
  // Europe
  "France":        "fr",
  "Germany":       "de",
  "Spain":         "es",
  "England":       "gb-eng",
  "Portugal":      "pt",
  "Netherlands":   "nl",
  "Italy":         "it",
  "Croatia":       "hr",
  "Belgium":       "be",
  "Poland":        "pl",
  "Switzerland":   "ch",
  "Austria":       "at",
  "Denmark":       "dk",
  "Sweden":        "se",
  "Norway":        "no",
  "Scotland":      "gb-sct",
  "Wales":         "gb-wls",
  "Turkey":        "tr",
  "Serbia":        "rs",
  "Hungary":       "hu",
  "Czech Republic": "cz",
  "Slovakia":      "sk",
  "Romania":       "ro",
  "Ukraine":       "ua",
  "Greece":        "gr",
  // Africa
  "Morocco":       "ma",
  "Senegal":       "sn",
  "Nigeria":       "ng",
  "Ghana":         "gh",
  "Cameroon":      "cm",
  "Egypt":         "eg",
  "Tunisia":       "tn",
  "Algeria":       "dz",
  "South Africa":  "za",
  "Ivory Coast":   "ci",
  // Asia / Oceania
  "Japan":         "jp",
  "South Korea":   "kr",
  "Australia":     "au",
  "Iran":          "ir",
  "Saudi Arabia":  "sa",
  "Qatar":         "qa",
  "China":         "cn",
  "New Zealand":   "nz",
  "Iraq":          "iq",
  "Jordan":        "jo",
  "Uzbekistan":    "uz",
  // Africa (additions)
  "Cape Verde":    "cv",
  "DR Congo":      "cd",
  // Caribbean
  "Haiti":         "ht",
  "Curaçao":       "cw",
  // Europe (additions)
  "Czechia":       "cz",
  "Bosnia and Herzegovina": "ba",
  // Renamed / alternate official names
  "Türkiye":       "tr",
  "United States": "us",
};

export function flagUrl(teamName: string): string | null {
  const code = TEAM_FLAGS[teamName];
  if (!code) return null;
  return `https://flagcdn.com/w40/${code}.png`;
}
