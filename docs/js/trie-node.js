export class TrieNode {
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
