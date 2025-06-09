# Field Guide Content

This directory and its subdirectories contain the content that appears in the
[Electricity Sector Field Guide](https://grahamlea.github.io/Electricity-Sector-Field-Guide/)
webapp.

It uses a very small subset of Markdown in a specific format, which is described below.

The rest of this document describes the files and their format.


## File Types

There are two file types within the data set: Index files and Entry files.
Entry files contain the details of a single Entry in the field guide.
Index files contain an index of Entries or other sub-Indexes for a Category or Region. 


## Templates

You can find templates for each of the file types in this same directory:
* [Template_Entry.md](Template_Entry.md)
* [Template_index.md](Template_index.md)


## Contributor Guidelines

There are instructions and tips for contributing to the project in both the templates above, 
and in [the CONTRIBUTING guide](../../CONTRIBUTING.md).


## Format

The Entry and Index files use a very small subset of Markdown.
This is done purely to ease the job of authoring data, 
with the added benefit of making data files formatted nicely on GitHub.
The actual app does not parse the files as Markdown and there is no plan to fully support Markdown.


### Headings Delineate Sections

Entry files must have a single level 1 heading, which contains the name of the term the entry is for e.g.
```markdown
# Alternating Current
```

All other headings must be level 2 headings, and do not contain variable text but fixed text which denotes the section type. E.g.
```markdown
## Synonyms
```


### Sections

Sections start with a level 1 or 2 heading and end at the next line starting with a `#` (or the end of the file).

An Index file MUST contain an `## Index` section, 
and MAY contain a `## Category` section and/or a `## Region` section.
Including an `# Entry Term Name` section and an `## Index` in the same file is an error.
Any other valid sections will be ignored.

An Entry file MUST contain an `# Entry Term Name` section and a `## Summary` section, 
and MAY contain any other valid section except for an `## Index` section.

Invalid section headings result in an error.

Here is a list of all allowed sections, and what their contents should be.

`## Index`

A list of proper Markdown links to other Entry files in the same directory
or Index files in its immediate subdirectories. (e.g. `[Alternating Current](Alternating_Current.md)`) 
Only the link filename is used.
The text of the link is only to assist with browsing data on GitHub.

`## Category`

A single word or short phrase describing a category of Entries, e.g. `Hardware`.

`## Region`

The name of a region where an Entry or an Index of entries applies, e.g. `Australia` or `North America`.

`## Synonyms`

A list of text names that this Entry's term is also known by.

`## Abbreviations`

A list of text abbreviations that are used for this Entry's term.

`## Summary`

A one-paragraph summary of the Entry's term. 
Can contain internal links.

`## More`

An optional deeper exposition of the Entry's term in one or more paragraphs. 
Can contain internal links.

`## Links`

A list of external links.


### Hashtags

The following hashtags are supported in Entry files only. 
They must appear on a line by themselves, and are typically included directly below the `# Entry Term Name`.
* `#UsedVeryFrequently` - denotes a term that is used very frequently
* `#Stub` - denotes an Entry created with minimal effort that would benefit from being fleshed out more


### Lists

All lists in this format must start the line with a single hyphen then a space, e.g.
```markdown
- A list item
```


### Internal Links

Within `## Summary` and `## More` secctions, links to other terms in the Field Guide can be made by enclosing the
target term in square brackets, e.g. `[Alternating Current]`.
The path to the Entry within the `data/` directory is NOT required.
The case (upper/lower case) of the text does not matter.
Both terms and links are converted into a slug format (e.g. `alternating-current`).


### External Links

Within `## Links` sections, links to external resources can be made using standard Markdown links that require a
special format within the link text:
```markdown
- [Title of target document @ Name of Source](https://example.com/link-to-redable-content)`
```
Both the title of the target and the name of the source are required, with an `@` character separating them.

The hashtag `#video` should be placed (with a separating space) after links that refer to video content, e.g. 
```markdown
- [What is Current @ Engineering Mindset](https://www.youtube.com/watch?v=8Posj4WMo0o) #video
```

---
END OF DOCUMENT
