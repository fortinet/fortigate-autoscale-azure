import { Context, HttpRequest } from '@azure/functions';
import {
    AutoscaleEnvironment,
    AzureFortiGateAutoscale,
    AzureFunctionHttpTriggerProxy,
    AzureFunctionResponse,
    AzurePlatformAdaptee,
    AzurePlatformAdapter
} from '@fortinet/fortigate-autoscale/azure';

// Azure Function request handler for http requests coming from FortiGate callback
// see: https://docs.microsoft.com/en-us/azure/azure-functions/functions-reference-node?tabs=v2
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
