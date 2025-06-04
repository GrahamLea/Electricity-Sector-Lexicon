import {IndentedLogger} from "./indented-logger.js";
import {TrieNode} from "./trie-node.js";
import {searchTokenScoresForEntry, WORD_SEPARATORS_REGEX} from "./search.js";

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


function start() {
    createApp({

        data() {
            return {
                entries: [],
                categoryHierarchies: new Map(),
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
                const searchTerms = this.searchText.split(WORD_SEPARATORS_REGEX)
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
                for (let e of this.entries) {
                    map.set(e.id, e)
                }
                return map
            },

            synonymsToTermIdsMap() {
                let map = new Map()
                for (let e of this.entries) {
                    for (let s of e.synonyms || []) {
                        map.set(this.termId(s), e.id)
                    }
                }
                return map
            },

            abbreviationsToTermIdsMap() {
                let map = new Map()
                for (let e of this.entries) {
                    for (let a of e.abbreviations || []) {
                        map.set(this.termId(a), e.id)
                    }
                }
                return map
            },

            entriesSorted() {
                if (this.selectedTerm) {
                    return this.selectedEntry ? [this.selectedEntry] : []
                }

                if (this.hasSearchTerms) {
                    return this.searchedEntries
                }

                const categoryOrder = Array(...this.categoryHierarchies.entries())
                    .sort((kvA, kvB) => kvA[1].localeCompare(kvB[1]))
                    .map(kv => kv[0])

                const map = new Map()
                for (const c of categoryOrder) {
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
                logger = logger || new IndentedLogger(LOG_DATA_LOADING)
                logger.log(`loadData(${file})`)

                context = context || { categoryHierarchy: "1" }

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
                    this.categoryHierarchies.set(context.category, context.categoryHierarchy)
                }
                if (data.region) {
                    context.region = data.region
                }
                if (data.tags) {
                    context.tags = (context.tags || []).concat(data.tags)
                }

                if (data.entries) {
                    await this.loadEntries(file, data, context, logger)
                }

                if (data.include) {
                    await this.loadIncludes(file, data, context, logger)
                }
            },

            async loadEntries(filename, data, context, logger) {
                logger.log(`loadEntries(${filename})`)
                let newEntriesCount = 0
                for (let entry of data.entries || []) {
                    if (!context.category) {
                        alert(`Data error: Context has no category while processing: ${entry.term}`)
                        continue
                    }
                    entry.id = this.termId(entry.term)
                    entry.category = context.category
                    entry.region = context.region
                    entry.tags = (entry.tags || []).concat(context.tags || [])
                    this.entries.push(entry)
                    newEntriesCount += 1
                    await this.$nextTick();
                }
                logger.log(`loadEntries(${filename}): Loaded ${newEntriesCount} entries`)
            },

            async loadIncludes(filename, data, context, logger) {
                logger.log(`loadIncludes(${filename})`)
                let directory = filename.substring(0, filename.lastIndexOf("/"));
                const importPromises = []
                let n = 0
                for (let importLocation of data.include || []) {
                    n++
                    let importFile
                    if (importLocation.endsWith("/")) {
                        importFile = `${directory}/${importLocation}index.json5`
                    } else {
                        importFile = `${directory}/${importLocation}.json5`
                    }
                    const childLogger = logger.createDeeperInstance()
                    const childContext = deepCopy(context)
                    childContext.categoryHierarchy = childContext.categoryHierarchy + "." + n
                    importPromises.push(this.loadData(importFile, childContext, childLogger))
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
                return term.toLowerCase().replaceAll(WORD_SEPARATORS_REGEX, "-")
            },

            isLink(text) {
                return text.match(LINK_REGEX)?.[0] === text
            },

            termInLink(text) {
                return text.slice(1, -1)
            },

            termIdForLinkText(text) {
                const textAsTermId = this.termId(text);
                if (this.entriesById.has(textAsTermId)) {
                    return textAsTermId;
                }
                return this.synonymsToTermIdsMap.get(textAsTermId)
                    || this.abbreviationsToTermIdsMap.get(textAsTermId);
            },

            linkTitle(link) {
                let host = new URL(link.href).host
                if (host.startsWith("www.")) { host = host.substring(4) }

                if (host.endsWith("wikipedia.org")) { host = "Wikipedia" }
                else if (host === "youtube.com") { host = "YouTube" }
                else if (host === "khanacademy.org") { host = "Khan Academy" }

                const source = link.source === host ? "" : ` - ${link.source}`

                return `${link.title}${source} (${host})`
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

            onKeyDown(event) {
                const modifierActive= event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;

                if (event.key === "/" && !modifierActive) {
                    if (document.activeElement === this.$refs.searchField) return;
                    event.preventDefault();
                    this.$refs.searchField.focus();
                }
                if (event.key === "Escape" && !modifierActive) {
                    if (document.activeElement === this.$refs.searchField) {
                        event.preventDefault();
                        this.clearSearchText()
                        this.$refs.searchField.blur();
                    }
                }
            }
        },

        async mounted() {
            window.addEventListener("keydown", this.onKeyDown);
            window.addEventListener("popstate", this.onUrlChange);
            window.addEventListener("hashchange", this.onUrlChange);
            bootstrap.Toast.getOrCreateInstance(this.$refs.termsLoadedToast).show()
            await this.loadData(DATA_ROOT)
            this.buildSearchTrie()
            this.updateSelectedTermFromHash();
            this.updateSearchTermFromQuery();
        },

        beforeUnmount() {
            window.removeEventListener("keydown", this.onKeyDown);
            window.removeEventListener("popstate", this.onUrlChange);
            window.removeEventListener("hashchange", this.onUrlChange);
        }
    }).mount('#app')
}


function deepCopy(objectOrArray) {
    return JSON.parse(JSON.stringify(objectOrArray))
}


start()
