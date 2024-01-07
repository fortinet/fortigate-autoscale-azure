import { CloudFunctionInvocationPayload, CloudFunctionInvocationTimeOutError } from '../core';
import { FortiGateAutoscaleFunctionInvocable } from '../fortigate-autoscale';

export type AzureFunctionInvocationPayload = CloudFunctionInvocationPayload;

export type AzureFunctionInvocableExecutionTimeOutError = CloudFunctionInvocationTimeOutError;

export const AzureFunctionInvocable = {
    ...FortiGateAutoscaleFunctionInvocable
};
