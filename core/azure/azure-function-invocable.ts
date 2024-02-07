import { CloudFunctionInvocationPayload, CloudFunctionInvocationTimeOutError } from '..';
import { FortiGateAutoscaleFunctionInvocable } from '../fortigate-autoscale';

export type AzureFunctionInvocationPayload = CloudFunctionInvocationPayload;

export type AzureFunctionInvocableExecutionTimeOutError = CloudFunctionInvocationTimeOutError;

// eslint-disable-next-line @typescript-eslint/naming-convention
export const AzureFunctionInvocable = {
    ...FortiGateAutoscaleFunctionInvocable
};
