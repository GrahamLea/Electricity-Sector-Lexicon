const { createApp } = Vue

const DATA_ROOT = "data/index.json5"

function deepCopy(object) {
    return JSON.parse(JSON.stringify(object))
}

createApp({
    data() {
        return {
            message: 'Hello Vue!',
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

        definitionsByCategory() {
            let map = new Map()
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
              alert(`Error loading data: ${response.statusText} (${response.status})`)
              return
          }
          let text = await response.text();``
          const data = JSON5.parse(text)
          if (data["category"]) {
              if (context.category) {
                  context.category = context.category + " / " + data["category"]
              } else {
                  context.category = data["category"]
              }
          }
          if (data["jurisdiction"]) {
              context.jurisdiction = data["jurisdiction"]
          }
          if (data["tags"]) {
              context.tags = (context.tags || []).concat(data["tags"])
          }

          let newDefinitions = []
          for (let definition of data["definitions"] || []) {
              if (!context.category) {
                  alert(`Data error: Definition has no category: ${definition["term"]}`)
              }
              definition["category"] = context.category
              definition["jurisdiction"] = context.jurisdiction
              definition["tags"] = (definition["tags"] || []).concat(context.tags)
              newDefinitions.push(definition)
          }
          this.definitions.push(...newDefinitions)

          let directory = file.substring(0, file.lastIndexOf("/"));
          for (let importLocation of data["include"] || []) {
              let importFile
              if (importLocation.endsWith("/")) {
                  importFile = `${directory}/${importLocation}index.json5`
              } else {
                  importFile = `${directory}/${importLocation}.json5`
              }
              this.loadData(importFile, deepCopy(context))
          }
      }
    },

    mounted() {
        this.loadData(DATA_ROOT, {})
    }
}).mount('#app')
