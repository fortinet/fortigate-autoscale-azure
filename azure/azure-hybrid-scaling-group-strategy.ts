import { CloudFunctionProxyAdapter, ScalingGroupStrategy } from '../core';
import { AzurePlatformAdapter } from '.';

export class AzureHybridScalingGroupStrategy implements ScalingGroupStrategy {
    platform: AzurePlatformAdapter;
    proxy: CloudFunctionProxyAdapter;
    constructor(platform: AzurePlatformAdapter, proxy: CloudFunctionProxyAdapter) {
        this.platform = platform;
        this.proxy = proxy;
    }
    onLaunchingVm(): Promise<string> {
        this.proxy.logAsInfo('calling AzureHybridScalingGroupStrategy.onLaunchingVm');
        this.proxy.logAsInfo('no operation needed in this phase.');
        this.proxy.logAsInfo('called AzureHybridScalingGroupStrategy.onLaunchingVm');
        return Promise.resolve('');
    }
    onLaunchedVm(): Promise<string> {
        this.proxy.logAsInfo('calling AzureHybridScalingGroupStrategy.onLaunchedVm');
        this.proxy.logAsInfo('no operation needed in this phase.');
        this.proxy.logAsInfo('called AzureHybridScalingGroupStrategy.onLaunchedVm');
        return Promise.resolve('');
    }
    onVmNotLaunched(): Promise<string> {
        this.proxy.logAsInfo('calling AzureHybridScalingGroupStrategy.onVmNotLaunched');
        this.proxy.logAsInfo('no operation needed in this phase.');
        this.proxy.logAsInfo('called AzureHybridScalingGroupStrategy.onVmNotLaunched');
        return Promise.resolve('');
    }
    onTerminatingVm(): Promise<string> {
        this.proxy.logAsInfo('calling AzureHybridScalingGroupStrategy.onTerminatingVm');
        this.proxy.logAsInfo('no operation needed in this phase.');
        this.proxy.logAsInfo('called AzureHybridScalingGroupStrategy.onTerminatingVm');
        return Promise.resolve('');
    }
    onTerminatedVm(): Promise<string> {
        this.proxy.logAsInfo('calling AzureHybridScalingGroupStrategy.onTerminatedVm');
        this.proxy.logAsInfo('no operation needed in this phase.');
        this.proxy.logAsInfo('called AzureHybridScalingGroupStrategy.onTerminatedVm');
        return Promise.resolve('');
    }
    completeLaunching(success = true): Promise<string> {
        this.proxy.logAsInfo('calling AzureHybridScalingGroupStrategy.onTerminatedVm');
        this.proxy.logAsInfo(`value passed to parameter: success: ${success}.`);
        this.proxy.logAsInfo('no operation needed in this phase.');
        this.proxy.logAsInfo('called AzureHybridScalingGroupStrategy.onTerminatedVm');
        return Promise.resolve('');
    }
    completeTerminating(success = true): Promise<string> {
        this.proxy.logAsInfo('calling AzureHybridScalingGroupStrategy.completeTerminating');
        this.proxy.logAsInfo(`value passed to parameter: success: ${success}.`);
        this.proxy.logAsInfo('no operation needed in this phase.');
        this.proxy.logAsInfo('called AzureHybridScalingGroupStrategy.completeTerminating');
        return Promise.resolve('');
    }
}
