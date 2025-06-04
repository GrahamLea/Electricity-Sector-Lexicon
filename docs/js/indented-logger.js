export class IndentedLogger {
    constructor(enabled, depth) {
        this.enabled = enabled
        this.depth = depth || 0
    }

    createDeeperInstance() {
        return this.enabled
            ? new IndentedLogger(this.enabled, this.depth + 1)
            : this
    }

    log(...args) {
        if (this.enabled) {
            console.log(' '.repeat(this.depth * 4), ...args)
        }
    }
}
