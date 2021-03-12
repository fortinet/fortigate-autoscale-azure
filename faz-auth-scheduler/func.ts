import { Context } from '@azure/functions';
import {
    AutoscaleEnvironment,
    AutoscaleServiceRequest,
    AzureFortiGateAutoscale,
    AzureFortiGateAutoscaleServiceProvider,
    AzureFunctionServiceProviderProxy,
    AzurePlatformAdaptee,
    AzurePlatformAdapter,
    FortiGateAutoscaleServiceRequestSource,
    FortiGateAutoscaleServiceType,
    JSONable
} from '@fortinet/fortigate-autoscale/azure';

// NOTE: Azure function Typscript has not yet defined interface for Timer trigger type.
// A custom TimeInfo is therefore defined here.
// TODO: replace the TimerInfo interface with the Azure official one once it's available.
export interface TimerInfo {
    schedule: unknown;
    scheduleStatus: unknown;
    [key: string]: unknown;
}
/* eslint-disable @typescript-eslint/no-unused-vars */
// Azure Function request handler for http requests coming from FortiGate callback
// see: https://docs.microsoft.com/en-us/azure/azure-functions/functions-reference-node?tabs=v2
// NOTE: in the function.json, this Azure Function is set to run on a scheduler on every 5 minutes.
/**
 * This FortiAnalyzer Authorization Scheduler is a timerTrigger type Azure function been called
 * regularly to perform Authoriaztion for any FortiGate connected to it.
 * @param  {Context} context Azure function Context
 * @param  {TimerInfo} req the original timer object from the trigger
 * @returns {Promise} do not return anything
 */
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
