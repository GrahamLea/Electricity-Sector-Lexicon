import {TrieNode} from "./trie-node.js";
import {searchTokenScoresForEntry, WORD_SEPARATORS_REGEX} from "./search.js";
import {loadData} from "./load-data.js";
import {termId} from "./terms.js";

const createApp = await import(
    location.origin === "https://grahamlea.github.io"
        ? "https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js"
        : "https://unpkg.com/vue@3/dist/vue.esm-browser.js")
    .then(module => { return module.createApp })

const DATA_ROOT = "data/index.md"

const searchLog = (...args) => {}
// const searchLog = console.log

const LINK_REGEX = /(\[.+?])/


function start() {
    createApp({

        data() {
            return {
                entries: [],
                selectedTerm: null,
                searchText: "",
                searchTrie: new TrieNode(),
                // A map of Category labels (e.g. "Hardware / General") to hierarchical order indexes (e.g. "03.02")
                categoryHierarchies: new Map()
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

            categoriesSorted() {
                return Array(...this.categoryHierarchies.entries())
                    .sort((kvA, kvB) => kvA[1].localeCompare(kvB[1]))
                    .map(kv => kv[0])
            },

            entriesSortedByCategory() {
                const map = new Map()
                for (const c of this.categoriesSorted) {
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
            },

            entriesSorted() {
                if (this.selectedTerm) {
                    return this.selectedEntry ? [this.selectedEntry] : []
                }

                if (this.hasSearchTerms) {
                    return this.searchedEntries
                }

                return this.entriesSortedByCategory
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
            async addCategory(category, categoryHierarchy) {
                this.categoryHierarchies.set(category, categoryHierarchy)
            },
            async addEntry(entry) {
                this.entries.push(entry)
                await this.$nextTick();
            },

            textSections(text) {
                return text.split(LINK_REGEX)
            },

            termId: termId,

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

            setHighestScrollTargetAsHash() {
                // This is the magic that allows browsing back to land on the same entry as was being viewed.
                if (!this.selectedEntry) {
                    // This finds the two scroll targets on each side of the boundary of the top of the viewport.
                    // It will change the hash when the scroll position crosses halfway between the start of one
                    // and the start of the next.
                    const elementsWithBounds = _(document.querySelectorAll('.termScrollTarget'))
                        .map(e => ({
                            element: e,
                            bounds: e.getBoundingClientRect()
                        }));
                    const lastInvisibleElement = elementsWithBounds
                        .findLast(eb => eb.bounds.top < -10)

                    const firstVisibleElement = elementsWithBounds
                        .find(eb => eb.bounds.top >= -10)

                    if (!lastInvisibleElement || !firstVisibleElement) return

                    const currentViewedElement =
                        firstVisibleElement.bounds.top > window.innerHeight ?
                            lastInvisibleElement.element
                            : Math.abs(firstVisibleElement.bounds.top) < Math.abs(lastInvisibleElement.bounds.top)
                                ? firstVisibleElement.element
                                : lastInvisibleElement.element

                    if (window.location.hash !== `#${currentViewedElement.id}`) {
                        history.replaceState(null, '', `#${currentViewedElement.id}`)
                    }
                }
            },

            pushNewUrlStateSoon() {
                const selectedTerm = this.selectedTerm
                const searchText = this.searchText
                setTimeout(() => {
                    const hasntChangedForABit = this.selectedTerm === selectedTerm && this.searchText === searchText;
                    if (hasntChangedForABit) {
                        const query = this.searchText === "" ? ""
                            : ("?" + new URLSearchParams([["q", this.searchText]]).toString())
                        // Don't keep a directLink in the hash if there's a query
                        const hash = (query !== "" && (this.selectedTerm || window.location.hash?.startsWith("#@")))
                            ? ""
                            : this.selectedTerm
                                ? `#@${this.selectedTerm}`
                                : window.location.hash?.startsWith("#@")
                                    ? ""
                                    : window.location.hash
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
                    const directLink = term.startsWith("@")
                    term = directLink ? term.slice(1) : term
                    term = term.replaceAll("%20", " ")
                    const id = this.termId(term)
                    const termId = (this.entriesById.has(id) ? id : undefined)
                        || this.synonymsToTermIdsMap.get(id)
                        || this.abbreviationsToTermIdsMap.get(id)
                    if (directLink) {
                        this.selectedTerm = term
                        // !this.selectedEntry because entry is set by link click except via direct URL change
                        if (!this.selectedEntry && termId) {
                            this.selectedTerm = termId
                        }
                    } else {
                        // Because content loads dynamically, we have to manually scroll to regular hashes... twice!
                        this.selectedTerm = undefined
                        document.getElementById(id)?.scrollIntoView()
                        setTimeout(() => {
                            document.getElementById(id)?.scrollIntoView()
                        }, 500)
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
            window.addEventListener("scroll", this.setHighestScrollTargetAsHash);
            let termsCountToast = bootstrap.Toast.getOrCreateInstance(this.$refs.termsLoadedToast, {autohide: false});
            termsCountToast.show()
            await loadData(DATA_ROOT, this.addCategory, this.addEntry)
            setTimeout(() => termsCountToast.hide(), 3000)
            this.buildSearchTrie()
            this.updateSearchTermFromQuery();
            this.$nextTick(() => {
                this.updateSelectedTermFromHash()
            })
        },

        beforeUnmount() {
            window.removeEventListener("keydown", this.onKeyDown);
            window.removeEventListener("popstate", this.onUrlChange);
            window.removeEventListener("hashchange", this.onUrlChange);
            window.removeEventListener("scroll", this.setHighestScrollTargetAsHash);
        }
    }).mount('#app')
}


start()
