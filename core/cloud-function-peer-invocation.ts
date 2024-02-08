import { JSONable } from './jsonable';

export interface CloudFunctionInvocationPayload extends JSONable {
    stringifiedData: string;
    invocable: string;
    invocationSecretKey: string;
    executionTime?: number;
}
export interface CloudFunctionPeerInvocation<TProxy, TPlatform> {
    proxy: TProxy;
    platform: TPlatform;
    executeInvocable(payload: CloudFunctionInvocationPayload, invocable: string): Promise<void>;
    handlePeerInvocation(functionEndpoint: string): Promise<void>;
}

export class CloudFunctionInvocationTimeOutError extends Error {
    extendExecution: boolean;
    constructor(message?: string, extendExecution = false) {
        super(message);
        this.extendExecution = extendExecution;
    }
}

export function constructInvocationPayload(
    payload: unknown,
    invocable: string,
    secretKey: string,
    executionTime?: number
): CloudFunctionInvocationPayload {
    const p: CloudFunctionInvocationPayload = {
        stringifiedData: JSON.stringify(payload),
        invocable: invocable,
        invocationSecretKey: secretKey,
        executionTime: executionTime
    };
    return p;
}

export function extractFromInvocationPayload(
    invocationPayload: CloudFunctionInvocationPayload
): unknown {
    return invocationPayload.stringifiedData && JSON.parse(invocationPayload.stringifiedData);
}
