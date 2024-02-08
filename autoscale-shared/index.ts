/* eslint-disable @typescript-eslint/no-unused-vars */
import { Context, HttpRequest } from '@azure/functions';
import {
    FortiGateAutoscaleServiceRequestSource,
    FortiGateAutoscaleServiceType
} from '../core/fortigate-autoscale';
import {
    AzureFortiGateAutoscale,
    AzureFortiGateAutoscaleFazAuthHandler,
    AzureFortiGateAutoscaleServiceProvider,
    AzureFunctionHttpTriggerProxy,
    AzureFunctionResponse,
    AzureFunctionServiceProviderProxy,
    AzurePlatformAdaptee,
    AzurePlatformAdapter
} from '../core/azure';
import { AutoscaleEnvironment, AutoscaleServiceRequest, JSONable } from '../core';

export interface TimerInfo {
    schedule: unknown;
    scheduleStatus: unknown;
    [key: string]: unknown;
}

export async function autoscaleHandler(
    context: Context,
    req: HttpRequest
): Promise<AzureFunctionResponse> {
    const env = {} as AutoscaleEnvironment;
    const proxy = new AzureFunctionHttpTriggerProxy(req, context);
    const platform = new AzurePlatformAdapter(new AzurePlatformAdaptee(), proxy);
    const autoscale = new AzureFortiGateAutoscale<HttpRequest, Context, AzureFunctionResponse>(
        platform,
        env,
        proxy
    );
    proxy.logAsInfo('Request:', req);
    const res = await autoscale.handleAutoscaleRequest(proxy, platform, env);
    // NOTE: it requires the following env var to save logs
    if (process.env.DEBUG_SAVE_CUSTOM_LOG) {
        await platform.saveLogs(proxy.allLogs);
    }
    // pass the response back to Azure Function context
    context.res = res;
    // output bindings
    // see: https://docs.microsoft.com/en-us/azure/azure-functions/functions-reference-node?tabs=v2#outputs
    return res;
}

export async function customLogHandler(
    context: Context,
    req: HttpRequest
): Promise<AzureFunctionResponse> {
    console.log(req);
    const timestamp = Number(req.headers['autoscale-log-timestamp']);
    console.log(timestamp);
    const env = {} as AutoscaleEnvironment;
    const proxy = new AzureFunctionHttpTriggerProxy(req, context);
    const platform = new AzurePlatformAdapter(new AzurePlatformAdaptee(), proxy);
    const autoscale = new AzureFortiGateAutoscale<HttpRequest, Context, AzureFunctionResponse>(
        platform,
        env,
        proxy
    );

    const res = await autoscale.handleLicenseRequest(proxy, platform, env);
    // NOTE: it requires the following env var to save logs
    if (process.env.DEBUG_SAVE_CUSTOM_LOG) {
        await platform.saveLogs(proxy.allLogs);
    }
    // pass the response back to Azure Function context
    context.res = res;
    // output bindings
    // see: https://docs.microsoft.com/en-us/azure/azure-functions/functions-reference-node?tabs=v2#outputs
    return res;
}

// Azure Function request handler for http requests coming from FortiGate callback
// see: https://docs.microsoft.com/en-us/azure/azure-functions/functions-reference-node?tabs=v2

export async function licenseHandler(
    context: Context,
    req: HttpRequest
): Promise<AzureFunctionResponse> {
    const env = {} as AutoscaleEnvironment;
    const proxy = new AzureFunctionHttpTriggerProxy(req, context);
    const platform = new AzurePlatformAdapter(new AzurePlatformAdaptee(), proxy);
    const autoscale = new AzureFortiGateAutoscale<HttpRequest, Context, AzureFunctionResponse>(
        platform,
        env,
        proxy
    );
    proxy.logAsInfo('Request:', req);
    const res = await autoscale.handleLicenseRequest(proxy, platform, env);
    // NOTE: it requires the following env var to save logs
    if (process.env.DEBUG_SAVE_CUSTOM_LOG) {
        await platform.saveLogs(proxy.allLogs);
    }
    // pass the response back to Azure Function context
    context.res = res;
    // output bindings
    // see: https://docs.microsoft.com/en-us/azure/azure-functions/functions-reference-node?tabs=v2#outputs
    return res;
}

export async function fazAuthHandler(
    context: Context,
    req: HttpRequest
): Promise<AzureFunctionResponse> {
    const functionUrl = req.url;
    const env = {} as AutoscaleEnvironment;
    const proxy = new AzureFunctionHttpTriggerProxy(req, context);
    const platform = new AzurePlatformAdapter(new AzurePlatformAdaptee(), proxy);
    const autoscale = new AzureFortiGateAutoscale<JSONable, Context, void>(platform, env, proxy);
    const handler = new AzureFortiGateAutoscaleFazAuthHandler(autoscale);
    proxy.logAsInfo('Request:', req);
    await handler.handlePeerInvocation(functionUrl);
    // NOTE: it requires the following env var to save logs
    if (process.env.DEBUG_SAVE_CUSTOM_LOG) {
        await platform.saveLogs(proxy.allLogs);
    }
    // push all euqued log to Azure
    proxy.formatResponse(null, null, null);
    context.res = {};
    return null;
}

// NOTE: Azure function Typscript has not yet defined interface for Timer trigger type.
// A custom TimeInfo is therefore defined here.
// TODO: replace the TimerInfo interface with the Azure official one once it's available.
export async function fazAuthScheduler(context: Context, req: TimerInfo): Promise<void> {
    // NOTE: the original timer is unused here.
    const serviceReq: AutoscaleServiceRequest = {
        serviceType: FortiGateAutoscaleServiceType.TriggerFazDeviceAuth,
        source: FortiGateAutoscaleServiceRequestSource.FortiGateAutoscale
    };
    const env = {} as AutoscaleEnvironment;
    const proxy = new AzureFunctionServiceProviderProxy(serviceReq, context);
    const platform = new AzurePlatformAdapter(new AzurePlatformAdaptee(), proxy);
    const autoscale = new AzureFortiGateAutoscale<JSONable, Context, void>(platform, env, proxy);
    const handler = new AzureFortiGateAutoscaleServiceProvider(autoscale);
    proxy.logAsInfo('Request:', req);
    await handler.handleServiceRequest(serviceReq);
    // NOTE: it requires the following env var to save logs
    if (process.env.DEBUG_SAVE_CUSTOM_LOG) {
        await platform.saveLogs(proxy.allLogs);
    }
    // push all euqued log to Azure
    proxy.formatResponse(null, null, null);
    context.res = {};
    return null;
}
