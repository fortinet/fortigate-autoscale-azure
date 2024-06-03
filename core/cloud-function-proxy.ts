// the no-shadow rule errored in the next line may be just a false alarm
// eslint-disable-next-line no-shadow
export enum LogLevel {
    Log = 'Log',
    Info = 'Info',
    Warn = 'Warn',
    Error = 'Error',
    Debug = 'Debug'
}
// the no-shadow rule errored in the next line may be just a false alarm
// eslint-disable-next-line no-shadow
export enum DebugMode {
    True = 'true',
    DebugOnly = 'DebugOnly'
}
// the no-shadow rule errored in the next line may be just a false alarm
// eslint-disable-next-line no-shadow
export enum ReqType {
    BootstrapConfig = 'BootstrapConfig',
    ByolLicense = 'ByolLicense',
    CloudFunctionPeerInvocation = 'PeerFunctionInvocation',
    CustomLog = 'CustomLog',
    HeartbeatSync = 'HeartbeatSync',
    LaunchedVm = 'LaunchedVm',
    LaunchingVm = 'LaunchingVm',
    ServiceProviderRequest = 'ServiceProviderRequest',
    StatusMessage = 'StatusMessage',
    TerminatedVm = 'TerminatedVm',
    TerminatingVm = 'TerminatingVm',
    VmNotLaunched = 'VmNotLaunched'
}
// the no-shadow rule errored in the next line may be just a false alarm
// eslint-disable-next-line no-shadow
export enum ReqMethod {
    GET,
    POST,
    PUT,
    DELETE,
    PATCH,
    HEAD,
    TRACE,
    OPTIONS,
    CONNECT
}

const reqMethod: Map<string, ReqMethod> = new Map([
    ['GET', ReqMethod.GET],
    ['POST', ReqMethod.POST],
    ['PUT', ReqMethod.PUT],
    ['DELETE', ReqMethod.DELETE],
    ['PATCH', ReqMethod.PATCH],
    ['HEAD', ReqMethod.HEAD],
    ['TRACE', ReqMethod.TRACE],
    ['OPTIONS', ReqMethod.OPTIONS],
    ['CONNECT', ReqMethod.CONNECT]
]);

export function mapHttpMethod(s: string): ReqMethod {
    return s && reqMethod.get(s.toUpperCase());
}

export interface ReqBody {
    [key: string]: unknown;
}

export interface ReqHeaders {
    [key: string]: unknown;
}

export type CloudFunctionResponseBody =
    | string
    | {
          [key: string]: unknown;
      }
    | unknown;

export interface CloudFunctionProxyAdapter {
    formatResponse(
        httpStatusCode: number,
        body: CloudFunctionResponseBody,
        headers: unknown
    ): unknown;
    log(message: string, level: LogLevel, ...others: unknown[]): void;
    logAsDebug(message: string | DebugMode, ...others: unknown[]): void;
    logAsInfo(message: string, ...others: unknown[]): void;
    logAsWarning(message: string, ...others: unknown[]): void;
    logAsError(message: string, ...others: unknown[]): void;
    /**
     * Output an Error level message containing the given message prefix, the error.message
     * and error.stack of the given error.
     *
     * @param {string} messagePrefix
     * @param {Error | string} error
     * @memberof CloudFunctionProxyAdapter
     */
    logForError(messagePrefix: string, error: Error): void;
    getRequestAsString(): Promise<string>;
    /**
     * return the remaining execution time (in millisecond) of the current cloud function process.
     *
     * @returns {number}
     * @memberof CloudFunctionProxyAdapter
     */
    getRemainingExecutionTime(): Promise<number>;
    getReqBody(): Promise<unknown>;
    /**
     * get the HTTP headers object
     *
     * NOTE: header keys will be treated case-insensitive as per
       the RFC https://tools.ietf.org/html/rfc7540#section-8.1.2
     * @returns {Promise} headers objectt
     */
    getReqHeaders(): Promise<ReqHeaders>;
    getReqMethod(): Promise<ReqMethod>;
}

export abstract class CloudFunctionProxy<TReq, TContext, TRes>
    implements CloudFunctionProxyAdapter
{
    request: TReq;
    context: TContext;
    constructor(req: TReq, context: TContext) {
        this.request = req;
        this.context = context;
    }
    abstract log(message: string, level: LogLevel, ...others: unknown[]): void;
    /**
     * output log message as debug level.
     * Only the first parameter 'message' will be shown normally.
     * A hint message - '* more messages are hidden'.
     * Add the process environment variable 'DEBUG_MODE' with value 'true' to show them.' - will
     * be also shown in the output following the 'message' parameter.
     * The rest parameters 'others' will be hidden.
     * When process.env.DEBUG_MODE exists and set any value of string type ,
     * the 'others' parameters will be shown too.
     * Passing the value DebugMode.DebugOnly to the 'message' will hide all from showing in the log
     * unless process.env.DEBUG_MODE exists.
     * @param  {string | DebugMode} message the message if passed a string type, will be shown if
     * process.env.DEBUG_MODE exists and is set any value of string type. Passing DebugMode type
     * can have special behaviors. (as describe above).
     * @param  {unknown[]} others the extra stuff to output via logAsDebug. These will be hidden
     * from output if process.env.DEBUG_MODE doesn't exist (as described above).
     * Otherwise, these will be shown.
     * @returns {void}
     */
    logAsDebug(message: string | DebugMode, ...others: unknown[]): void {
        const otherCount = (others && others.length) || 0;
        const hint =
            otherCount === 0
                ? ''
                : `${otherCount} more messages are hidden. Add the process environment` +
                  " variable 'DEBUG_MODE' with value 'true' to show them.";
        // DEBUG_MODE exists in process.env.
        if (process.env.DEBUG_MODE !== null && process.env.DEBUG_MODE !== undefined) {
            // message will be shown in debug mode only
            if (message === DebugMode.DebugOnly) {
                return;
            }
            // show message, and others.
            else {
                this.log(message, LogLevel.Debug, ...others);
            }
        }
        // DEBUG_MODE not exists in process.env.
        else {
            // don't sho anything if debug only
            if (message === DebugMode.DebugOnly) {
                return;
            }
            // otherwise, show message appended with a hint. others will be hidden.
            else {
                this.log(message ? `${message}. ${hint}` : hint, LogLevel.Debug);
            }
        }
    }
    logAsError(message: string, ...others: unknown[]): void {
        this.log(message, LogLevel.Error, ...others);
    }
    logAsInfo(message: string, ...others: unknown[]): void {
        this.log(message, LogLevel.Info, ...others);
    }
    logAsWarning(message: string, ...others: unknown[]): void {
        this.log(message, LogLevel.Warn, ...others);
    }
    logForError(messagePrefix: string, error: Error, ...others: unknown[]): void {
        const errMessage = error.message || '(no error message available)';
        const errStack = (error.stack && ` Error stack:${error.stack}`) || '';

        this.log(`${messagePrefix}. Error: ${errMessage}${errStack}`, LogLevel.Error, ...others);
    }
    abstract formatResponse(
        httpStatusCode: number,
        body: CloudFunctionResponseBody,
        headers: unknown
    ): TRes;
    abstract getRequestAsString(): Promise<string>;
    abstract getRemainingExecutionTime(): Promise<number>;
    abstract getReqBody(): Promise<unknown>;
    abstract getReqHeaders(): Promise<ReqHeaders>;
    abstract getReqMethod(): Promise<ReqMethod>;
    abstract getReqQueryParameters(): Promise<{ [name: string]: string }>;
}
