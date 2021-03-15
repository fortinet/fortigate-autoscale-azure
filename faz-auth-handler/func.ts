import { Context, HttpRequest } from '@azure/functions';
import {
    AutoscaleEnvironment,
    AzureFortiGateAutoscale,
    AzureFortiGateAutoscaleFazAuthHandler,
    AzureFunctionHttpTriggerProxy,
    AzureFunctionResponse,
    AzurePlatformAdaptee,
    AzurePlatformAdapter,
    JSONable
} from '@fortinet/autoscale/fortigate-autoscale/azure';
/* eslint-disable @typescript-eslint/no-unused-vars */
// Azure Function request handler for http requests coming from FortiGate callback
// see: https://docs.microsoft.com/en-us/azure/azure-functions/functions-reference-node?tabs=v2
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
