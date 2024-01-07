import { Context } from '@azure/functions';
import {
    AzureFortiGateAutoscaleSetting,
    AzureFortiGateBootstrapStrategy,
    AzureFunctionHttpTriggerProxy,
    AzureFunctionInvocable,
    AzureHybridScalingGroupStrategy,
    AzurePlatformAdapter,
    AzureRoutingEgressTrafficViaPrimaryVmStrategy,
    AzureTaggingAutoscaleVmStrategy
} from '.';
import {
    AutoscaleEnvironment,
    CloudFunctionInvocationPayload,
    CloudFunctionInvocationTimeOutError,
    CloudFunctionProxyAdapter,
    ConstantIntervalHeartbeatSyncStrategy,
    FazDeviceAuthorization,
    JSONable,
    ReusableLicensingStrategy,
    WeightedScorePreferredGroupPrimaryElection
} from '../core';
import {
    FazReactiveAuthorizationStrategy,
    FortiGateAutoscale,
    FortiGateAutoscaleFunctionInvocationHandler
} from '../fortigate-autoscale';

export class AzureFortiGateAutoscale<TReq, TContext, TRes> extends FortiGateAutoscale<
    TReq,
    TContext,
    TRes
> {
    constructor(
        readonly platform: AzurePlatformAdapter,
        readonly env: AutoscaleEnvironment,
        readonly proxy: CloudFunctionProxyAdapter
    ) {
        super();
        // TODO: to be implemented
        // use noop scaling group strategy
        this.setScalingGroupStrategy(new AzureHybridScalingGroupStrategy(platform, proxy));
        // use peferred group primary election for Hybrid licensing model
        this.setPrimaryElectionStrategy(
            new WeightedScorePreferredGroupPrimaryElection(platform, proxy)
        );
        // use a constant interval heartbeat sync strategy
        this.setHeartbeatSyncStrategy(new ConstantIntervalHeartbeatSyncStrategy(platform, proxy));
        // TODO: implement the Azure tagging feature
        // use Azure resource tagging strategy
        this.setTaggingAutoscaleVmStrategy(new AzureTaggingAutoscaleVmStrategy(platform, proxy));
        // use FortiGate bootstrap configuration strategy
        this.setBootstrapConfigurationStrategy(
            new AzureFortiGateBootstrapStrategy(platform, proxy, env)
        );
        // // use the Resuable licensing strategy
        this.setLicensingStrategy(new ReusableLicensingStrategy(platform, proxy));
        // TODO: need to figure out how Azure VNet route egress traffic
        // use the routing egress traffic via primary vm strategy
        this.setRoutingEgressTrafficStrategy(
            new AzureRoutingEgressTrafficViaPrimaryVmStrategy(platform, proxy, env)
        );
        // use the reactive authorization strategy for FAZ integration
        this.setFazIntegrationStrategy(new FazReactiveAuthorizationStrategy(platform, proxy));
    }
}

export class AzureFortiGateAutoscaleFazAuthHandler extends FortiGateAutoscaleFunctionInvocationHandler {
    autoscale: AzureFortiGateAutoscale<JSONable, Context, void>;
    constructor(autoscale: AzureFortiGateAutoscale<JSONable, Context, void>) {
        super();
        this.autoscale = autoscale;
    }
    get proxy(): AzureFunctionHttpTriggerProxy {
        return this.autoscale.proxy as AzureFunctionHttpTriggerProxy;
    }

    get platform(): AzurePlatformAdapter {
        return this.autoscale.platform;
    }

    async executeInvocable(
        payload: CloudFunctionInvocationPayload,
        invocable: string
    ): Promise<void> {
        const payloadData: JSONable = JSON.parse(payload.stringifiedData);
        const settings = await this.platform.getSettings();
        if (invocable === AzureFunctionInvocable.TriggerFazDeviceAuth) {
            const fazIpSettingItem = settings.get(AzureFortiGateAutoscaleSetting.FortiAnalyzerIp);
            if (!fazIpSettingItem.value) {
                throw new CloudFunctionInvocationTimeOutError(
                    'FortiAnalyzer IP address not specified.'
                );
            }
            const deviceAuthorization: FazDeviceAuthorization = {
                vmId: payloadData.vmId as string,
                privateIp: payloadData.privateIp && String(payloadData.privateIp),
                publicIp: payloadData.publicIp && String(payloadData.publicIp)
            };

            // extract the autoscale admin user and faz info
            const username: string = await this.platform.getSecretFromKeyVault(
                'faz-autoscale-admin-username'
            );
            const password: string = await this.platform.getSecretFromKeyVault(
                'faz-autoscale-admin-password'
            );
            const fazIp: string = fazIpSettingItem.value;
            const fazPort = '443';

            await this.autoscale.fazIntegrationStrategy
                .processAuthorizationRequest(
                    deviceAuthorization,
                    fazIp,
                    fazPort,
                    username,
                    password
                )
                .catch(e => {
                    const error: CloudFunctionInvocationTimeOutError = e;
                    error.extendExecution = false;
                    throw error;
                });
            return;
        }
        // otherwise, no matching invocable, throw error
        throw new CloudFunctionInvocationTimeOutError(`No matching invocable for: ${invocable}`);
    }
}
