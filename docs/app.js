const {createApp} = Vue

const DATA_ROOT = "data/index.json5"

const LINK_REGEX = /(\[.+?])/
const SPACES_REGEX = / +/g

function deepCopy(object) {
    return JSON.parse(JSON.stringify(object))
}

createApp({
    data() {
        return {
            message: 'Hello Vue!',
            selectedTerm: null,
            definitions: []
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

        definitionsById() {
            let map = new Map()
            for (let d of this.definitions) {
                map.set(d.id, d)
            }
            return map
        },

        definitionsByCategory() {
            let map = new Map()

            if (this.selectedTerm) {
                if (this.selectedDefinition) {
                    map.set(this.selectedDefinition.category, [this.selectedDefinition])
                }
                return map
            }

            for (let c of this.categories) {
                map.set(c, [])
            }
            for (let d of this.definitions) {
                map.get(d.category).push(d)
            }
            return map
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
            if (data.jurisdiction) {
                context.jurisdiction = data.jurisdiction
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
                definition.jurisdiction = context.jurisdiction
                definition.tags = (definition.tags || []).concat(context.tags)

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

        linkTagFor(text) {
            const term = text.slice(1, -1)
            if (this.definitionsById.has(this.termId(term))) {
                return `<a href="#${this.termId(term)}" onclick="">${term}</a>`
            } else {
                return `<i class="bi bi-exclamation-diamond-fill"></i>️ [${term}] <i class="bi bi-exclamation-diamond-fill"></i>`
            }
        },

        clearSelectedTerm() {
            this.selectedTerm = undefined
            // Note: The below doesn't trigger a 'hashchange' event
            history.pushState('', document.title, window.location.pathname + window.location.search)
        },

        updateFromHash() {
            const hash = window.location.hash;
            if (hash && hash !== "" && hash !== "#") {
                let term = hash.startsWith("#") ? hash.slice(1) : hash
                term = term.replaceAll("%20", " ")
                this.selectedTerm = term
                if (!this.selectedDefinition && this.definitionsById.has(this.termId(term))) {
                    window.location.hash = this.termId(term)
                }
                window.scrollTo(0,0)
            } else {
                this.selectedTerm = undefined
            }
        }
    },

    async mounted() {
        await this.loadData(DATA_ROOT, {})
        addEventListener("hashchange", this.updateFromHash);
        this.updateFromHash();
    }
}).mount('#app')
