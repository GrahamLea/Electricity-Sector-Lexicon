export const WORD_SEPARATORS_REGEX = /[\s-]+/g
const NON_WORD_CHARS_REGEX = /[^\w'_-]+/g

function tokensIn(string) /* : Array<String> */ {
    return string
        .replaceAll(NON_WORD_CHARS_REGEX, " ")
        .split(WORD_SEPARATORS_REGEX)
        .map(s => s.toLowerCase())
        .filter(s => !STOP_WORDS.has(s))
}

export function searchTokenScoresForEntry(entry) /* : Map<String, number> */ {
    const tokenScores = new Map();
    const tokenListFns = [
        () => tokensIn(entry.definition.more || ""),
        () => tokensIn(entry.definition.summary || ""),
        () => tokensIn(entry.category),
        () => (entry.tags || []).flatMap(tokensIn),
        () => tokensIn(entry.region || ""),
        () => (entry.abbreviations || []).flatMap(tokensIn),
        () => (entry.synonyms || []).flatMap(tokensIn),
        () => tokensIn(entry.term)
    ]
    let score = 1
    for (let tlf of tokenListFns) {
        for (let t of tlf()) {
            tokenScores.set(t, (tokenScores.get(t) || 0) + score)
        }
        score *= 100
    }
    return tokenScores
}

const STOP_WORDS = new Set([
    "",
    "a",
    "all",
    "also",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "by",
    "but",
    "can",
    "does",
    "for",
    "from",
    "have",
    "if",
    "in",
    "is",
    "it",
    "just",
    "like",
    "may",
    "may",
    "might",
    "must",
    "not",
    "of",
    "on",
    "only",
    "or",
    "s",
    "so",
    "some",
    "such",
    "that",
    "the",
    "their",
    "then",
    "they",
    "those",
    "to",
    "when",
    "which",
    "while",
    "will",
])
