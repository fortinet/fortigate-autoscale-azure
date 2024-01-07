import crypto from 'crypto';
import { CloudFunctionProxyAdapter } from './cloud-function-proxy';

export function genChecksum(str: string, algorithm: string): string {
    return crypto
        .createHash(algorithm)
        .update(str, 'utf8')
        .digest('hex');
}

export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}
/**
 * Component of WaitFor(). An emitter function that returns a promise of type TResult.
 * The returned value of type TResult will be passed to the WaitForConditionChecker.
 * @template TResult a generic type for the returning value.
 * @returns {Promise<TResult>} the returning result in a promise
 */
export type WaitForPromiseEmitter<TResult> = () => Promise<TResult>;

/**
 * Component of WaitFor(). A custom checker function that takes a value of type TInput.
 * The value of type TInput is passed from the returning value from WaitForPromiseEmitter.
 * The custom checker will check the TInput and return a boolean indicating whether a passing
 * condition is met or not.
 * @param {TInput} input a generic type for the input value
 * @param {number} callCount the number of time the emitter function been called.
 * @returns {boolean} the boolean result of condition which is used to quit the waitFor()
 */
export type WaitForConditionChecker<TInput> = (
    input: TInput,
    callCount: number,
    ...args
) => Promise<boolean>;

// the no-shadow rule errored in the next line may be just a false alarm
// eslint-disable-next-line no-shadow
export enum WaitForMaxCount {
    NoMaxCount = 0,
    Count30 = 30
}
/**
 * A repeatedly running function that periodically takes a custom action, checks the result
 * against a condition, and stops once the condition is met.
 *
 * @template TResult a generic type for the values being passed between emitter and checker.
 * @param {WaitForPromiseEmitter<TResult>} promiseEmitter the emitter that return a value of TResult
 * @param {WaitForConditionChecker<TResult>} conditionChecker the checker that
 * takes a value of TResult as an input and performs a custom checking for a condition to quit the
 * waitFor.
 * @param {number} interval milliseconds interval between each calling emitter.
 * @param {CloudFunctionProxyAdapter} [proxy] a proxy (if provided) that prints logs withing the
 * waitFor process.
 * @param {WaitForMaxCount} maxCount a new max count to override the default max count (30).
 * use NoMaxCount if you prefer to control the stopping of this function by the condition checker and only.
 * @returns {Promise<TResult>} the returning result of the emitter
 */
export async function waitFor<TResult>(
    promiseEmitter: WaitForPromiseEmitter<TResult>,
    conditionChecker: WaitForConditionChecker<TResult>,
    interval: number,
    proxy?: CloudFunctionProxyAdapter,
    maxCount?: WaitForMaxCount
): Promise<TResult> {
    let count = 0;
    maxCount = (maxCount === undefined && WaitForMaxCount.Count30) || maxCount;
    if (interval <= 0) {
        interval = 5000; // soft default to 5 seconds
    }
    try {
        let result: TResult;
        let complete = false;
        do {
            if (proxy) {
                proxy.logAsInfo('Await condition check result.');
            }
            result = await promiseEmitter();
            complete = await conditionChecker(result, ++count, proxy || undefined);
            if (!complete) {
                if (maxCount !== WaitForMaxCount.NoMaxCount && count >= maxCount) {
                    throw new Error(
                        `It reached the default maximum number (${maxCount}) of attempts.` +
                            'Providing a new maxCount or bypass it with setting maxCount to 0.'
                    );
                }
                if (proxy) {
                    proxy.logAsInfo(
                        `Condition check not passed, count: ${count}. Retry in ${interval} ms.`
                    );
                }
                await sleep(interval);
            } else {
                if (proxy) {
                    proxy.logAsInfo('Condition check passed. End waiting and returns task result.');
                }
                break;
            }
        } while (!complete);
        return result;
    } catch (error) {
        if (proxy) {
            proxy.logForError('WaitFor() is interrupted.', error);
        }
        throw error;
    }
}

/**
 * Compare anything
 *
 * @param {*} anyA one of the two value to be compare with each other
 * @param {*} anyB one of the two value to be compare with each other
 * @returns {boolean} true if their result of JSON.stringify are qual.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function compareAny(anyA: any, anyB: any): boolean {
    return JSON.stringify(anyA) === JSON.stringify(anyB);
}

export function compareObject(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    objectA: { [key: string]: any },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    objectB: { [key: string]: any }
): boolean {
    return (
        typeof objectA === 'object' && typeof objectB === 'object' && compareAny(objectA, objectB)
    );
}

/**
 * A compareAny(a, b) equivalent. Allows for taking one object as parameter first, then
 * take more more objects as parameter in the returned functions.
 * @param {any} objectA an object to compare
 * @returns {} an object of functions that compare objectA with others provided as parameters of
 * each function.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const compare = (anyA: any): { isEqualTo: (anyB: any) => boolean } => {
    return {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        isEqualTo: (anyB: any): boolean => {
            return compareAny(anyA, anyB);
        }
    };
};

export function isIpV4(input: string, includeHostAddress = true): boolean {
    const host = (includeHostAddress && '{1}') || '?';
    const exp = `^(([0-9]|[1-9][0-9]|1[0-9][0-9]|2[0-4][0-9]|25[0-5]).){3}([0-9]|[1-9][0-9]|1[0-9][0-9]|2[0-4][0-9]|25[0-5]){1}(/([0-9]|[1-2][0-9]|3[0-2]))${host}$`;
    const matches = input.match(new RegExp(exp, 'i'));
    return matches && matches[0] === input;
}
/**
 * This function extends the JSON.stringify() to accept Map type value by a possible transformation
 * @param  {string} k key
 * @param  {unknown} v value
 * @returns {unknown} a value that is possibly transformed or itself, otherwise.
 */
export function jsonStringifyReplacer(
    k: string,
    v: unknown
): { type: string; value: unknown[] } | unknown {
    if (v instanceof Map) {
        return {
            type: 'Map',
            value: [...v]
        };
    } else {
        return v;
    }
}
/**
 * This function extends the JSON.parse() to deserialzie a string into a value of Map type, where
 * the string is transformed with helper function jsonStringifyReplacer()
 * @param  {string} k key
 * @param  {unkown} v value
 * @returns {unknown} a value that is possibly detransformed or itself, otherwise.
 */
export function jsonParseReviver(
    k: string,
    v: { type: string; value: unknown[] } | unknown
): unknown {
    if (typeof v === 'object' && v !== null) {
        const val: { type: string; value: unknown[] } = { type: undefined, value: undefined };
        Object.assign(val, v);
        if (val.type === 'Map' && val.value instanceof Array) {
            // val.value is transformed by jsonStringifyReplacer as [any, any][]
            return new Map((val.value as [unknown, unknown][]) as [unknown, unknown][]);
        }
    }
    return v;
}
