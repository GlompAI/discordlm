type Fn<Arguments extends unknown[]> = (...args: Arguments) => unknown;
type PromiseWrap<X> = X extends Promise<unknown> ? X : Promise<X>;

export class Queue {
    #_queue: [
        fn: Fn<unknown[]>,
        args: unknown[],
        resolve: (value: unknown) => void,
        reject: (reason?: unknown) => void,
    ][] = [];
    #workers = 0;
    #parallelism: number;

    public constructor(parallelism: number = 1) {
        this.#parallelism = parallelism;
    }

    public push<Arguments extends unknown[], Callback extends Fn<Arguments>>(
        fn: Callback,
        ...args: Arguments
    ): PromiseWrap<ReturnType<Callback>> {
        return new Promise((resolve, reject) => {
            this.#_queue.push([fn as unknown as Fn<unknown[]>, args, resolve, reject]);
            this._run();
        }) as PromiseWrap<ReturnType<Callback>>;
    }

    private _run() {
        if (this.#workers >= this.#parallelism || this.#_queue.length < 1) return;
        this.#workers++;
        (async () => {
            const value = this.#_queue.shift();
            if (value !== undefined) {
                const [fn, args, resolve, reject] = value;
                try {
                    const result = await fn(...args);
                    resolve(result);
                } catch (error) {
                    reject(error);
                }
            }
            this.#workers--;
            this._run();
        })();
    }
}
