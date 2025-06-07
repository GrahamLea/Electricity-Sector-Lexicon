import {IndentedLogger} from "./indented-logger.js";
import {termId} from "./terms.js";

const LOG_DATA_LOADING = false
export const MARKDOWN_INDEX_LINK_REGEX = /\[[^\]]+]\(([^)]+)\)/
export const MARKDOWN_ENTRY_LINK_REGEX = /\[([^\]]+) +@ +([^\]]+)]\(([^)]+)\)/

/*
'data' format (from file):

category?: string
region?: string
imports: string[]
entries: Entry[]

Entry:

term: string
isStub: boolean
synonyms?: string[]
abbreviations?: string[]
category: string
region?: string
usedVeryFrequently?: boolean
definition: {
    summary: string
    more?: string
}
links: Array<{
    source: string
    title: string
    href: string
    isVideo?: boolean
}>
*/

export async function loadData(file, addCategory, addEntry, context, logger) {
    logger = logger || new IndentedLogger(LOG_DATA_LOADING)
    logger.log(`loadData(${file})`)

    context = context || {categoryHierarchy: ""}

    const response = await fetch(file);
    if (!response.ok) {
        alert(`Error loading data from ${file}: ${response.statusText} (${response.status})`)
        return
    }
    let text = await response.text();
    const data = parseMarkdown(text, file, logger)

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

    if (data.term) {
        await loadTerm(file, data, addCategory, addEntry, context, logger)
    }

    if (data.imports?.length > 0) {
        await loadImports(file, data.imports, addCategory, addEntry, context, logger)
    }
}


async function loadTerm(filename, entry, addCategory, addEntry, context, logger) {
    logger.log(`loadTerm(${filename})`)
    if (!context.category) {
        alert(`Data error: Context has no category while processing: ${entry.term}`)
        return
    }
    entry.id = termId(entry.term)
    entry.category = context.category
    entry.region = context.region
    await addEntry(entry)
    logger.log(`loadTerm(${filename}): Loaded '${entry.term}'`)
}


async function loadImports(filename, imports, addCategory, addEntry, context, logger) {
    logger.log(`loadImports(${filename})`)
    let directory = filename.substring(0, filename.lastIndexOf("/"));
    const importPromises = []
    let n = 0
    for (let importLocation of imports) {
        n++
        const importFile = `${directory}/${importLocation}`
        const childLogger = logger.createDeeperInstance()
        const childContext = deepCopy(context)
        childContext.categoryHierarchy += (childContext.categoryHierarchy ? "." : "") + `${n}`.padStart(2, "0")
        importPromises.push(loadData(importFile, addCategory, addEntry, childContext, childLogger))
    }
    await Promise.all(importPromises).catch(reason => {
        console.log("Error while loading data: ", reason)
        alert("Error while loading data: " + reason)
    })
    logger.log(`loadImports(${filename}): Done`)
}

const validHeadings = new Set([
    "Index", "Category", "Region", "Synonyms", "Abbreviations", "Summary", "More", "Links"
])
const validTags = new Set(["UsedVeryFrequently", "Stub"])

function parseMarkdown(text, filename, logger) {
    const lines = text.split("\n")

    const term = parseTerm(lines)
    const imports = parseIndex(lines, filename)
    if (!!imports?.length === !!term) {
        throw new Error(`Files must have either an Index or a Term (level 1 heading).
         File has either both or neither: ${filename}`)
    }

    const category = parseSingleLineValue(lines, "## Category", filename)
    const region = parseSingleLineValue(lines, "## Region", filename)
    const synonyms = parseTextList(lines, "## Synonyms", filename)
    const abbreviations = parseTextList(lines, "## Abbreviations", filename)
    const summary = parseMultiLineText(lines, "## Summary", filename)
    const more = parseMultiLineText(lines, "## More", filename)
    const links = parseLinks(lines, filename)
    const usedVeryFrequently = containsLine(lines, "#UsedVeryFrequently")
    const isStub = containsLine(lines, "#Stub")

    const invalidSections = (lines).filter(l => l.startsWith("## ")).map(l => l.substring(3)).filter(l => !validHeadings.has(l))
    const invalidHeadings = (lines).filter(l => l.startsWith("### ") || l.startsWith("### "))
    const invalidHashtags = (lines).filter(isHashtag).map(l => l.substring(1)).filter(l => !validTags.has(l))

    if (invalidSections.length) {
        throw new Error(`File '${filename}' has invalid sections: ${invalidSections}`)
    }
    if (invalidHeadings.length) {
        throw new Error(`File '${filename}' has invalid headings (too deep): ${invalidHeadings}`)
    }
    if (invalidHashtags.length) {
        throw new Error(`File '${filename}' has invalid hashtags: ${invalidHashtags}`)
    }

    let result;
    if (imports?.length) {
        result = {
            category,
            region,
            imports
        }
    } else {
        if (!summary) {
            throw new Error(`Entry '${term}' has no Summary`)
        }
        result = {
            category,
            region,
            term,
            synonyms,
            abbreviations,
            usedVeryFrequently,
            isStub,
            definition: {
                summary,
                more
            },
            links
        }
    }
    logger.log(`parseMarkdown(${filename})`, {result})
    return result
}

function parseSingleLineValue(lines, header, filename) {
    const contentLines = getSection(lines, header, filename)
    if (contentLines.length > 1) {
        throw new Error(`Error in '${filename}': ${header} value should be one line but was: ${contentLines}`)
    }
    return contentLines.length === 1 ? contentLines[0] : undefined
}

function parseTextList(lines, header, filename) {
    const contentLines = getSection(lines, header, filename)
    if (contentLines.find(line => !line.startsWith("- "))) {
        throw new Error(`Error in '${filename}': ${header} can contain only lines starting with '- '`)
    }
    return contentLines.map(line => line.substring(1).trim())
}

function parseMultiLineText(lines, header, filename) {
    return getSection(lines, header, filename).map(line => line || "\n").join(" ")
}

function parseTerm(lines, filename) {
    const firstLevelHeadingLines = lines.filter(line => line.startsWith("# "))
    if (firstLevelHeadingLines.length > 1) {
        throw new Error(`Error in '${filename}': More than one first-level heading found: ${firstLevelHeadingLines}`)
    }
    return firstLevelHeadingLines.length > 0
        ? firstLevelHeadingLines[0].substring(1).trim()
        : undefined
}

function parseIndex(lines, filename) {
    const imports = parseTextList(lines, "## Index", filename)
    return imports.map(s => {
        const match = s.match(MARKDOWN_INDEX_LINK_REGEX)
        if (match) {
            return match[1]
        }
        throw new Error(`Error in '${filename}': Index entry is not a properly formatted link: ${s}`)
    })
}

function parseLinks(lines, filename) {
    const imports = parseTextList(lines, "## Links", filename)
    return imports.map(s => {
        const match = s.match(MARKDOWN_ENTRY_LINK_REGEX)
        if (!match) {
            throw new Error(`Error in '${filename}': Index entry is not a properly formatted link: ${s}`)
        }
        const hashtags = s.split(" ").filter(isHashtag)
        let invalidHashtags = hashtags.filter(t => t !== "#video");
        if (invalidHashtags.length) {
            throw new Error(`Error in '${filename}': Link has invalid hashtags: ${invalidHashtags}`)
        }
        return {
            title: match[1],
            source: match[2],
            href: match[3],
            isVideo: hashtags.includes("#video")
        }
    })
}

function containsLine(lines, hashtag) {
    return !!lines.find(line => line.trim() === hashtag)
}

function getSection(lines, header, filename) {
    let inSection = false
    const result = []
    for (const line of lines) {
        if (!inSection && line === header) {
            if (result.length > 0) {
                throw new Error(`Error in '${filename}': Section appears more than once: ${header}`)
            }
            inSection = true
        } else if (inSection && line.startsWith("#")) {
            inSection = false
        } else if (inSection) {
            result.push(line.trim())
        }
    }
    return _.dropRightWhile(result, s => s === "")
}

function isHashtag(line) {
    return line.length > 1
        && line[0] === "#"
        && line[1] !== "#"
        && line[1] !== " "
}

function deepCopy(objectOrArray) {
    return JSON.parse(JSON.stringify(objectOrArray))
}
