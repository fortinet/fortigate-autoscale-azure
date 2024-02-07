import { Context } from '@azure/functions';
import { AutoscaleServiceProvider, AutoscaleServiceRequest, JSONable, ReqType } from '..';
import {
    FortiGateAutoscaleServiceRequestSource,
    FortiGateAutoscaleServiceType
} from '../fortigate-autoscale';
import {
    AzureFortiGateAutoscale,
    AzureFunctionDef,
    AzureFunctionServiceProviderProxy,
    AzurePlatformAdapter
} from '.';

export class AzureFortiGateAutoscaleServiceProvider
    implements AutoscaleServiceProvider<AutoscaleServiceRequest, void>
{
    constructor(readonly autoscale: AzureFortiGateAutoscale<JSONable, Context, void>) {
        this.autoscale = autoscale;
    }
    startAutoscale(): Promise<boolean> {
        this.autoscale.proxy.logAsWarning('[startAutoscale] Method not implemented.');
        return Promise.resolve(true);
    }
    stopAutoscale(): Promise<boolean> {
        this.autoscale.proxy.logAsWarning('[stopAutoscale] Method not implemented.');
        return Promise.resolve(true);
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    saveAutoscaleSettings(props: { [key: string]: string }): Promise<boolean> {
        this.autoscale.proxy.logAsWarning('[SaveAutoscaleSettings] Method not implemented.');
        return Promise.resolve(true);
    }
    get proxy(): AzureFunctionServiceProviderProxy {
        return this.autoscale.proxy as AzureFunctionServiceProviderProxy;
    }
    get platform(): AzurePlatformAdapter {
        return this.autoscale.platform;
    }
    async handleServiceRequest(request: AutoscaleServiceRequest): Promise<void> {
        this.proxy.logAsInfo('calling handleServiceRequest');
        try {
            // Verify the incoming request.
            // request url must be contained in the defined function name array: serviceFuncUrl
            const allowedServiceEndpointsList: string[] = [AzureFunctionDef.FazAuthScheduler.name];
            const functionName = this.proxy.context.executionContext.functionName;
            if (!allowedServiceEndpointsList.includes(functionName)) {
                this.proxy.logAsWarning(
                    'Unauthorized source url.',
                    `request function name: ${JSON.stringify(functionName)}`,
                    `request: ${request}`
                );
                this.proxy.logAsInfo('called handleServiceRequest');
            }
            // req type must be ReqType.ServiceProviderRequest
            const reqType: ReqType = await this.platform.getRequestType();
            if (reqType !== ReqType.ServiceProviderRequest) {
                this.proxy.logAsWarning(
                    'Invalid service provider request.',
                    `request type: ${reqType}`,
                    `request: ${request}`
                );
                this.proxy.logAsInfo('called handleServiceRequest');
                return;
            }
            // request body must contain key: 'source' with value: 'fortinet.autoscale'
            if (request.source !== FortiGateAutoscaleServiceRequestSource.FortiGateAutoscale) {
                this.proxy.logAsWarning(
                    'Invalid service provider source.',
                    `request source: ${request.source}`,
                    `request: ${request}`
                );
                this.proxy.logAsInfo('called handleServiceRequest');
            }
            // service type must be present in request
            if (!request.serviceType) {
                this.proxy.logAsWarning(
                    'Invalid service provider request type.',
                    `request source: ${request.serviceType}`,
                    `request: ${request}`
                );
                this.proxy.logAsInfo('called handleServiceRequest');
            }
            switch (request.serviceType) {
                case FortiGateAutoscaleServiceType.TriggerFazDeviceAuth:
                    await this.autoscale.init();
                    await this.autoscale.triggerFazDeviceAuth();
                    break;
                default:
                    throw new Error(`Unsupported service type: [${request.serviceType}]`);
            }
        } catch (error) {
            this.proxy.logForError('Handle service request error.', error);
            this.proxy.logAsInfo('called handleServiceRequest');
        }
    }
}
