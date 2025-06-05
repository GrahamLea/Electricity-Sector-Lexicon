const WORD_SEPARATORS_REGEX = /[\s-]+/g

export function termId(term) {
    return term.toLowerCase().replaceAll(WORD_SEPARATORS_REGEX, "-")
}
