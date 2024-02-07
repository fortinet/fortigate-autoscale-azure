import { AutoscaleEnvironment, CloudFunctionProxyAdapter, RoutingEgressTrafficStrategy } from '..';
import { AzurePlatformAdapter } from '.';

/**
 * This strategy updates the route table associated with the private subnets which need outgoing
 * traffic capability. It adds/replace the route to the primary FortiGate vm in the Autoscale cluster
 * so the FortiGate can handle such egress traffic.
 */
export class AzureRoutingEgressTrafficViaPrimaryVmStrategy implements RoutingEgressTrafficStrategy {
    protected platform: AzurePlatformAdapter;
    protected proxy: CloudFunctionProxyAdapter;
    protected env: AutoscaleEnvironment;
    constructor(
        platform: AzurePlatformAdapter,
        proxy: CloudFunctionProxyAdapter,
        env: AutoscaleEnvironment
    ) {
        this.platform = platform;
        this.proxy = proxy;
        this.env = env;
    }
    apply(): Promise<void> {
        this.proxy.logAsInfo('calling RoutingEgressTrafficViaPrimaryVmStrategy.apply');
        // TODO: implementation needed.
        this.proxy.logAsInfo('feature not yet implemented.');
        this.proxy.logAsInfo('called RoutingEgressTrafficViaPrimaryVmStrategy.apply');
        return Promise.resolve();
    }
}
