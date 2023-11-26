const {createApp} = Vue

const DATA_ROOT = "data/index.json5"

const LINK_REGEX = /(\[.+?])/
const SPACES_REGEX = / +/g
const NON_WORD_CHARS_REGEX = /[^\w'_-]+/g


function start() {
    createApp({

        data() {
            return {
                definitions: [],
                selectedTerm: null,
                searchText: "",
                searchTrie: new TrieNode()
            }
        },

        computed: {
            categories() {
                let cats = new Set()
                for (let def of this.definitions) {
                    if (def.category) {
                        cats.add(def.category)
                    }
                }
                return cats
            },

            selectedDefinition() {
                return this.definitionsById.get(this.selectedTerm)
            },

            searchTerms() {
                return this.searchText.split(SPACES_REGEX).filter(s => s.length > 0)
            },

            hasSearchTerms() {
                return this.searchTerms.length !== 0
            },

            searchedDefinitions() {
                if (!this.hasSearchTerms) return []

                // noinspection JSPotentiallyInvalidTargetOfIndexedPropertyAccess
                const matchScores = this.searchTrie.getAll(this.searchTerms[0])
                for (const term of this.searchTerms.splice(1)) {
                    const nextTermScores = this.searchTrie.getAll(term)
                    for (const [id, score] of Object.entries(matchScores)) {
                        if (nextTermScores[id]) {
                            matchScores[id] = score + nextTermScores[id]
                        } else {
                            delete matchScores[id]
                        }
                    }
                }

                const sortedMatchScores = Object.entries(matchScores)
                    .sort(([idA, scoreA], [idB, scoreB]) => {
                        return scoreA > scoreB ? -1
                            : scoreA < scoreB ? 1
                                : idA < idB ? -1
                                    : idA > idB ? 1
                                        : 0
                    });
                return sortedMatchScores.map(([id, _]) => this.definitionsById.get(id))
            },

            definitionsById() {
                let map = new Map()
                for (let d of this.definitions) {
                    map.set(d.id, d)
                }
                return map
            },

            definitionsSorted() {
                if (this.selectedTerm) {
                    return [this.selectedDefinition]
                }

                if (this.hasSearchTerms) {
                    return this.searchedDefinitions
                }

                const map = new Map()
                for (const c of this.categories) {
                    map.set(c, [])
                }
                for (const d of this.definitions) {
                    map.get(d.category).push(d)
                }
                const result = []
                for (const [_, defs] of map.entries()) {
                    result.push(...defs)
                }
                return result
            }
        },

        watch: {
            selectedTerm(newSelectedTerm) {
                if (newSelectedTerm && this.searchText !== "") {
                    this.clearSearchText()
                }
                this.pushNewUrlStateSoon()
            },

            searchText(newSearchText) {
                if (newSearchText !== "" && this.selectedTerm != null) {
                    this.clearSelectedTerm()
                }
                this.pushNewUrlStateSoon()
            }
        },

        methods: {
            async loadData(file, context) {
                const response = await fetch(file);
                if (!response.ok) {
                    alert(`Error loading data from ${file}: ${response.statusText} (${response.status})`)
                    return
                }
                let text = await response.text();
                const data = JSON5.parse(text)
                if (data.category) {
                    if (context.category) {
                        context.category = context.category + " / " + data.category
                    } else {
                        context.category = data.category
                    }
                }
                if (data.region) {
                    context.region = data.region
                }
                if (data.tags) {
                    context.tags = (context.tags || []).concat(data.tags)
                }

                let newDefinitions = []
                for (let definition of data.definitions || []) {
                    if (!context.category) {
                        alert(`Data error: Context has no category while processing: ${definition.term}`)
                        continue
                    }
                    definition.id = this.termId(definition.term)
                    definition.category = context.category
                    definition.region = context.region
                    definition.tags = (definition.tags || []).concat(context.tags || [])
                    definition.searchTokenScores = searchTokenScoresForDefinition(definition)
                    newDefinitions.push(definition)
                }
                this.definitions.push(...newDefinitions)

            const importPromises = []
            let directory = file.substring(0, file.lastIndexOf("/"));
            for (let importLocation of data.include || []) {
                let importFile
                if (importLocation.endsWith("/")) {
                    importFile = `${directory}/${importLocation}index.json5`
                } else {
                    importFile = `${directory}/${importLocation}.json5`
                }
                importPromises.push(this.loadData(importFile, deepCopy(context)))
            }
            await Promise.allSettled(importPromises)
        },

            textSections(text) {
                return text.split(LINK_REGEX)
            },

            termId(term) {
                return term.toLowerCase().replaceAll(SPACES_REGEX, "-")
            },

            isLink(text) {
                return text.match(LINK_REGEX)?.[0] === text
            },

            termInLink(text) {
                return text.slice(1, -1)
            },

            clearSelectedTerm() {
                this.selectedTerm = undefined
                this.pushNewUrlStateSoon()
            },

            clearSearchText() {
                this.searchText = ""
                this.pushNewUrlStateSoon()
            },

            pushNewUrlStateSoon() {
                const selectedTerm1 = this.selectedTerm
                const searchText1 = this.searchText
                setTimeout(() => {
                    const hasntChangedForASecond = this.selectedTerm === selectedTerm1 && this.searchText === searchText1;
                    if (hasntChangedForASecond) {
                        const query = this.searchText === "" ? ""
                            : ("?" + new URLSearchParams([["q", this.searchText]]).toString())
                        const hash = this.selectedTerm ? "#" + this.selectedTerm : ""
                        if (query !== location.search || hash !== location.hash) {
                            history.pushState('', document.title, window.location.pathname + query + hash)
                        }
                    }
                }, 500)
            },

            onUrlChange() {
                this.updateSelectedTermFromHash()
                this.updateSearchTermFromQuery()
            },

            updateSelectedTermFromHash() {
                const hash = window.location.hash;
                if (hash && hash !== "" && hash !== "#") {
                    let term = hash.startsWith("#") ? hash.slice(1) : hash
                    term = term.replaceAll("%20", " ")
                    this.selectedTerm = term
                    if (!this.selectedDefinition && this.definitionsById.has(this.termId(term))) {
                        this.selectedTerm = this.termId(term)
                        const hash = this.selectedTerm ? "#" + this.selectedTerm : ""
                        history.pushState('', document.title, window.location.pathname + hash)
                    }
                    window.scrollTo(0, 0)
                } else {
                    this.selectedTerm = undefined
                }
            },

            updateSearchTermFromQuery() {
                if (location.search.length !== 0) {
                    this.searchText = new URLSearchParams(location.search).get("q") || ""
                } else {
                    this.searchText = ""
                }
            },

            buildSearchTrie() {
                for (const def of this.definitions) {
                    for (const [term, score] of def.searchTokenScores.entries()) {
                        this.searchTrie.insert(term, def.id, score)
                    }
                }
            },

            onKeyPress(event) {
                if (event.key !== "/") return;

                if (document.activeElement === this.$refs.searchInput) return;

                event.preventDefault();
                this.$refs.searchField.focus();
            }
        },

        async mounted() {
            window.addEventListener("keypress", this.onKeyPress);
            window.addEventListener("popstate", this.onUrlChange);
            window.addEventListener("hashchange", this.onUrlChange);
            await this.loadData(DATA_ROOT, {})
            this.buildSearchTrie()
            this.updateSelectedTermFromHash();
            this.updateSearchTermFromQuery();
        },

        beforeUnmount() {
            window.removeEventListener("keypress", this.onKeyPress);
            window.removeEventListener("popstate", this.onUrlChange);
            window.removeEventListener("hashchange", this.onUrlChange);
        }
    }).mount('#app')
}


function deepCopy(objectOrArray) {
    return JSON.parse(JSON.stringify(objectOrArray))
}


function tokensIn(string) /* : Array<String> */ {
    return string
        .replaceAll(NON_WORD_CHARS_REGEX, " ")
        .split(SPACES_REGEX)
        .map(s => s.toLowerCase())
        .filter(s => !STOP_WORDS.has(s))
}


function searchTokenScoresForDefinition(def) /* : Map<String, number> */ {
    const tokenScores = new Map();
    const tokenListFns = [
        () => tokensIn(def.definition.more || ""),
        () => tokensIn(def.definition.summary || ""),
        () => tokensIn(def.category),
        () => (def.tags || []).flatMap(tokensIn),
        () => tokensIn(def.region || ""),
        () => (def.acronyms || []).flatMap(tokensIn),
        () => tokensIn(def.term)
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


class TrieNode {
    constructor() {
        this.branches = {}
        this.leaves = []
    }

    insert(key, value, score) {
        if (key.length === 0) {
            this.leaves.push([value, score])
        } else {
            let b = this.branches[key[0]]
            if (!b) {
                b = this.branches[key[0]] = new TrieNode()
            }
            b.insert(key.slice(1), value, score)
        }
    }

    getAll(key, result) {
        if (!result) {
            result = {}
        }
        if (key.length !== 0) { // Not at the end of the word yet
            if (this.branches[key[0]]) {
                this.branches[key[0]].getAll(key.slice(1), result)
            }
        } else { // Reached the end of the search word
            for (const [value, score] of this.leaves) {
                result[value] = Math.max(result[value] || 0, score)
            }
            for (const trie of Object.values(this.branches)) {
                trie.getAll(key, result)
            }
        }
        return result
    }
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


start()
