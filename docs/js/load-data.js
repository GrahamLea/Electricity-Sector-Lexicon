import {IndentedLogger} from "./indented-logger.js";
import {termId} from "./terms.js";

const LOG_DATA_LOADING = false

export async function loadData(file, addCategory, addEntry, context, logger) {
    logger = logger || new IndentedLogger(LOG_DATA_LOADING)
    logger.log(`loadData(${file})`)

    context = context || { categoryHierarchy: "" }

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
        addCategory(context.category, context.categoryHierarchy)
    }
    if (data.region) {
        context.region = data.region
    }

    if (data.entries) {
        await loadEntries(file, data, addCategory, addEntry, context, logger)
    }

    if (data.include) {
        await loadIncludes(file, data, addCategory, addEntry, context, logger)
    }
}


async function loadEntries(filename, data, addCategory, addEntry, context, logger) {
    logger.log(`loadEntries(${filename})`)
    let newEntriesCount = 0
    for (let entry of data.entries || []) {
        if (!context.category) {
            alert(`Data error: Context has no category while processing: ${entry.term}`)
            continue
        }
        entry.id = termId(entry.term)
        entry.category = context.category
        entry.region = context.region
        await addEntry(entry)
        newEntriesCount += 1
    }
    logger.log(`loadEntries(${filename}): Loaded ${newEntriesCount} entries`)
}


async function loadIncludes(filename, data, addCategory, addEntry, context, logger) {
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
        childContext.categoryHierarchy += (childContext.categoryHierarchy ? "." : "") + `${n}`.padStart(2, "0")
        importPromises.push(loadData(importFile, addCategory, addEntry, childContext, childLogger))
    }
    await Promise.all(importPromises).catch(reason => {
        console.log("Error while loading data: ", reason)
        alert("Error while loading data: " + reason)
    })
    logger.log(`loadIncludes(${filename}): Done`)
}


function deepCopy(objectOrArray) {
    return JSON.parse(JSON.stringify(objectOrArray))
}
