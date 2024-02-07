/* eslint-disable @typescript-eslint/naming-convention */
import {
    CloudFunctionInvocationPayload,
    CloudFunctionInvocationTimeOutError,
    CloudFunctionPeerInvocation,
    CloudFunctionProxyAdapter,
    extractFromInvocationPayload,
    PlatformAdapter,
    ReqType
} from '..';
import { FortiGateAutoscaleSetting } from '.';

export const FortiGateAutoscaleFunctionInvocable = {
    TriggerFazDeviceAuth: 'TriggerFazDeviceAuth'
};

export abstract class FortiGateAutoscaleFunctionInvocationHandler
    implements CloudFunctionPeerInvocation<CloudFunctionProxyAdapter, PlatformAdapter>
{
    abstract get proxy(): CloudFunctionProxyAdapter;
    abstract get platform(): PlatformAdapter;
    abstract executeInvocable(
        payload: CloudFunctionInvocationPayload,
        invocable: string
    ): Promise<void>;

    async handlePeerInvocation(functionEndpoint: string): Promise<void> {
        this.proxy.logAsInfo('calling handlePeerInvocation.');
        try {
            // init the platform. this step is important
            await this.platform.init();
            const requestType = await this.platform.getRequestType();
            const settings = await this.platform.getSettings();
            if (requestType !== ReqType.CloudFunctionPeerInvocation) {
                this.proxy.logAsWarning('Not a CloudFunctionPeerInvocation type request. Skip it.');
                this.proxy.logAsInfo('called handlePeerInvocation.');
                return;
            }
            // get the invocation payload
            const invocationPayload: CloudFunctionInvocationPayload =
                (await this.proxy.getReqBody()) as CloudFunctionInvocationPayload;
            if (!invocationPayload) {
                throw new Error('Invalid request body.');
            }

            // authentication verification
            const payload: unknown = extractFromInvocationPayload(invocationPayload);
            const invocationSecretKey = this.platform.createAutoscaleFunctionInvocationKey(
                payload,
                functionEndpoint,
                invocationPayload.invocable
            );

            // verify the invocation key
            if (
                !invocationSecretKey ||
                invocationSecretKey !== invocationPayload.invocationSecretKey
            ) {
                throw new Error('Invalid invocation payload: invocationSecretKey not matched');
            }
            const currentExecutionStartTime = Date.now(); // ms
            const extendExecution = settings.get(
                FortiGateAutoscaleSetting.AutoscaleFunctionExtendExecution
            );
            const shouldExtendExecution: boolean = extendExecution && extendExecution.truthValue;
            try {
                await this.executeInvocable(invocationPayload, invocationPayload.invocable);
            } catch (e) {
                if (
                    e instanceof CloudFunctionInvocationTimeOutError &&
                    e.extendExecution &&
                    shouldExtendExecution
                ) {
                    const maxExecutionTimeItem = settings.get(
                        FortiGateAutoscaleSetting.AutoscaleFunctionMaxExecutionTime
                    );
                    // the maximum execution time allowed for a cloud function
                    // NOTE: the time is set in second.
                    const maxExecutionTime =
                        maxExecutionTimeItem && Number(maxExecutionTimeItem.value);

                    // time taken in preceeding relevent invocations and time taken in
                    // current invocation.
                    // NOTE: this time is also in second.
                    const executionTime: number =
                        (!isNaN(invocationPayload.executionTime) &&
                            invocationPayload.executionTime) ||
                        0;
                    const totalExecutionTime =
                        Math.floor((Date.now() - currentExecutionStartTime) / 1000) + executionTime;

                    // if max execution time not reached, create a new invocation to continue
                    if (totalExecutionTime < maxExecutionTime) {
                        await this.platform.invokeAutoscaleFunction(
                            payload,
                            functionEndpoint,
                            invocationPayload.invocable,
                            // carry the total execution time to the next call.
                            totalExecutionTime
                        );
                        this.proxy.logAsInfo(
                            'AutoscaleFunctionExtendExecution is enabled.' +
                                ` Current total execution time is: ${totalExecutionTime} seconds.` +
                                ` Max execution time allowed is: ${maxExecutionTime} seconds.` +
                                ' Now invoke a new Lambda function to continue.'
                        );
                    } else {
                        this.proxy.logAsError(
                            'AutoscaleFunctionExtendExecution is enabled.' +
                                ` Current total execution time is: ${totalExecutionTime} seconds.` +
                                ` Max execution time allowed is: ${maxExecutionTime} seconds.` +
                                ' No more time allowed to wait so it timed out and failed.'
                        );
                        // extended execution reached max execution time allowed.
                        throw e;
                    }
                } else {
                    // not a CloudFunctionInvocationTimeOutError or not allow to extend execution.
                    throw e;
                }
            }
            this.proxy.logAsInfo('called handlePeerInvocation.');
            return;
        } catch (error) {
            // ASSERT: error is always an instance of Error
            this.proxy.logForError('called handlePeerInvocation.', error);
        }
    }
}
