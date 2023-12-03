const createApp = await import(
    location.origin === "https://grahamlea.github.io"
        ? "https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js"
        : "https://unpkg.com/vue@3/dist/vue.esm-browser.js")
    .then(module => { return module.createApp })

const LOG_DATA_LOADING = false
const DATA_ROOT = "data/index.json5"

const searchLog = (...args) => {}
// const searchLog = console.log

const LINK_REGEX = /(\[.+?])/
const SPACES_REGEX = / +/g
const NON_WORD_CHARS_REGEX = /[^\w'_-]+/g


function start() {
    createApp({

        data() {
            return {
                entries: [],
                selectedTerm: null,
                searchText: "",
                searchTrie: new TrieNode()
            }
        },

        computed: {
            categories() {
                let cats = new Set()
                for (let entry of this.entries) {
                    if (entry.category) {
                        cats.add(entry.category)
                    }
                }
                return cats
            },

            selectedEntry() {
                return this.entriesById.get(this.selectedTerm)
            },

            searchTerms() {
                const searchTerms = this.searchText.split(SPACES_REGEX)
                    .filter(s => s.length > 0)
                    .map(s => s.toLowerCase());
                searchLog(`searchText: '${this.searchText}' -> searchTerms: ${searchTerms}`)
                return searchTerms
            },

            hasSearchTerms() {
                const hasSearchTerms = this.searchTerms.length !== 0;
                searchLog(`searchTerms: '${this.searchTerms}' -> hasSearchTerms: ${hasSearchTerms}`)
                return hasSearchTerms
            },

            searchedEntries() {
                if (!this.hasSearchTerms) {
                    searchLog(`searchedEntries(): !hasSearchTerms`)
                    return []
                }

                // noinspection JSPotentiallyInvalidTargetOfIndexedPropertyAccess
                const matchScores = this.searchTrie.getAll(this.searchTerms[0])
                searchLog("    matchScores:", matchScores)
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
                searchLog("    matchScores (after filter+sum):", matchScores)

                const sortedMatchScores = Object.entries(matchScores)
                    .sort(([idA, scoreA], [idB, scoreB]) => {
                        return scoreA > scoreB ? -1
                            : scoreA < scoreB ? 1
                                : idA < idB ? -1
                                    : idA > idB ? 1
                                        : 0
                    });
                searchLog("    sortedMatchScores:", sortedMatchScores)
                const terms = sortedMatchScores.map(([id, _]) => this.entriesById.get(id));
                searchLog("    terms:", sortedMatchScores)
                return terms
            },

            entriesById() {
                let map = new Map()
                for (let d of this.entries) {
                    map.set(d.id, d)
                }
                return map
            },

            entriesSorted() {
                if (this.selectedTerm) {
                    return [this.selectedEntry]
                }

                if (this.hasSearchTerms) {
                    return this.searchedEntries
                }

                const map = new Map()
                for (const c of this.categories) {
                    map.set(c, [])
                }
                for (const d of this.entries) {
                    map.get(d.category).push(d)
                }
                const result = []
                for (const [_, entries] of map.entries()) {
                    result.push(...entries)
                }
                return result
            }
        },

        watch: {
            selectedTerm(newSelectedTerm) {
                if (newSelectedTerm) {
                    if (this.searchText !== "") {
                        this.clearSearchText()
                    }
                    this.$nextTick(() => {
                        window.scrollTo(0, 0)
                    })
                }
                this.pushNewUrlStateSoon()
            },

            searchText(newSearchText) {
                if (newSearchText !== "") {
                    if (this.selectedTerm != null) {
                        this.clearSelectedTerm()
                    }
                    this.$nextTick(() => {
                        window.scrollTo(0, 0)
                    })
                }
                this.pushNewUrlStateSoon()
            }
        },

        methods: {
            async loadData(file, context, logger) {
                logger = logger || new IndentedLogger()
                logger.log(`loadData(${file})`)

                context = context ? deepCopy(context) : {}

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

                if (data.entries) {
                    this.loadEntries(file, data, context, logger)
                }

                if (data.include) {
                    await this.loadIncludes(file, data, context, logger)
                }
            },

            loadEntries(filename, data, context, logger) {
                logger.log(`loadEntries(${filename})`)
                let newEntries = []
                for (let entry of data.entries || []) {
                    if (!context.category) {
                        alert(`Data error: Context has no category while processing: ${entry.term}`)
                        continue
                    }
                    entry.id = this.termId(entry.term)
                    entry.category = context.category
                    entry.region = context.region
                    entry.tags = (entry.tags || []).concat(context.tags || [])
                    newEntries.push(entry)
                }
                this.entries.push(...newEntries)
                logger.log(`loadEntries(${filename}): Loaded ${newEntries.length} entries`)
            },

            async loadIncludes(filename, data, context, logger) {
                logger.log(`loadIncludes(${filename})`)
                let directory = filename.substring(0, filename.lastIndexOf("/"));
                const importPromises = []
                for (let importLocation of data.include || []) {
                    let importFile
                    if (importLocation.endsWith("/")) {
                        importFile = `${directory}/${importLocation}index.json5`
                    } else {
                        importFile = `${directory}/${importLocation}.json5`
                    }
                    const childLogger = logger.createDeeperInstance()
                    importPromises.push(this.loadData(importFile, context, childLogger))
                }
                await Promise.all(importPromises).catch(reason => {
                    console.log("Error while loading data: ", reason)
                    alert("Error while loading data: " + reason)
                })
                logger.log(`loadIncludes(${filename}): Done`)
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
                    if (!this.selectedEntry && this.entriesById.has(this.termId(term))) {
                        this.selectedTerm = this.termId(term)
                        const hash = this.selectedTerm ? "#" + this.selectedTerm : ""
                        history.pushState('', document.title, window.location.pathname + hash)
                    }
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
                console.log("buildSearchTrie(): Starting")
                const start = Date.now()
                for (const entry of this.entries) {
                    for (const [term, score] of searchTokenScoresForEntry(entry).entries()) {
                        this.searchTrie.insert(term, entry.id, score)
                    }
                }
                console.log(`buildSearchTrie(): Done. ${this.searchTrie.leavesCount()} tokens included in ${Date.now() - start}ms`)
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
            await this.loadData(DATA_ROOT)
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


function searchTokenScoresForEntry(entry) /* : Map<String, number> */ {
    const tokenScores = new Map();
    const tokenListFns = [
        () => tokensIn(entry.definition.more || ""),
        () => tokensIn(entry.definition.summary || ""),
        () => tokensIn(entry.category),
        () => (entry.tags || []).flatMap(tokensIn),
        () => tokensIn(entry.region || ""),
        () => (entry.acronyms || []).flatMap(tokensIn),
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


class IndentedLogger {
    constructor(depth) {
        this.depth = depth || 0
    }

    createDeeperInstance() {
        return LOG_DATA_LOADING ? new IndentedLogger(this.depth + 1) : this
    }

    log(...args) {
        if (LOG_DATA_LOADING) {
            console.log(' '.repeat(this.depth * 4), ...args)
        }
    }
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

    leavesCount() {
        return this.leaves.length
            + Object.values(this.branches).reduce((total, node) => total + node.leavesCount(), 0)
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
