export class AnalysisQueue {
    #worker;
    #pending = [];
    #keys = new Set();
    #running = false;
    #generation = 0;
    #idleResolvers = [];

    constructor(worker) { this.#worker = worker; }

    enqueue(input) {
        if (!input?.key || this.#keys.has(input.key)) return false;
        const job = { ...input, queueGeneration: this.#generation };
        this.#keys.add(job.key);
        this.#pending.push(job);
        this.#drain();
        return true;
    }

    cancel() {
        this.#generation++;
        for (const job of this.#pending) this.#keys.delete(job.key);
        this.#pending = [];
    }

    isCurrent(job) { return job.queueGeneration === this.#generation; }

    idle() {
        if (!this.#running && this.#pending.length === 0) return Promise.resolve();
        return new Promise(resolve => this.#idleResolvers.push(resolve));
    }

    async #drain() {
        if (this.#running) return;
        this.#running = true;
        while (this.#pending.length) {
            const job = this.#pending.shift();
            try { await this.#worker(job); } finally { this.#keys.delete(job.key); }
        }
        this.#running = false;
        for (const resolve of this.#idleResolvers.splice(0)) resolve();
    }
}
