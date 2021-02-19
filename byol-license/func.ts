import { Context, HttpRequest } from '@azure/functions';
import {
    AutoscaleEnvironment,
    AzureFortiGateAutoscale,
    AzureFunctionInvocationProxy,
    AzureFunctionResponse,
    AzurePlatformAdaptee,
    AzurePlatformAdapter
} from 'autoscale-core';

// Azure Function request handler for http requests coming from FortiGate callback
// see: https://docs.microsoft.com/en-us/azure/azure-functions/functions-reference-node?tabs=v2
export async function licenseHandler(
    context: Context,
    req: HttpRequest
): Promise<AzureFunctionResponse> {
    console.log(req);
    const env = {} as AutoscaleEnvironment;
    const proxy = new AzureFunctionInvocationProxy(req, context);
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
