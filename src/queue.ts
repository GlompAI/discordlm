type Fn<Arguments extends unknown[]> = (...args: Arguments) => any;
type PromiseWrap<X> = X extends Promise<any> ? X : Promise<X>;

export class Queue {
    #_queue: [fn: any, args: any[], resolve: any, reject: any][] = [];
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
            this.#_queue.push([fn, args, resolve, reject]);
            this._run();
        }) as any;
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
