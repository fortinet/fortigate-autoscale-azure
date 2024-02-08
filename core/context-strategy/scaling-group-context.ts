import { CloudFunctionProxyAdapter } from '../cloud-function-proxy';
import { PlatformAdapter } from '../platform-adapter';

export interface ScalingGroupStrategy {
    onLaunchingVm(): Promise<string>;
    onLaunchedVm(): Promise<string>;
    onTerminatingVm(): Promise<string>;
    onTerminatedVm(): Promise<string>;
    onVmNotLaunched(): Promise<string>;
    completeLaunching(success?: boolean): Promise<string>;
    completeTerminating(success?: boolean): Promise<string>;
}

/**
 * To provide auto scaling group related logics such as scaling out, scaling in.
 */
export interface ScalingGroupContext {
    setScalingGroupStrategy(strategy: ScalingGroupStrategy): void;
    handleLaunchingVm(): Promise<string>;
    handleLaunchedVm(): Promise<string>;
    handleTerminatingVm(): Promise<string>;
    handleTerminatedVm(): Promise<string>;
    handleVmNotLaunched(): Promise<string>;
}

export class NoopScalingGroupStrategy implements ScalingGroupStrategy {
    platform: PlatformAdapter;
    proxy: CloudFunctionProxyAdapter;
    constructor(platform: PlatformAdapter, proxy: CloudFunctionProxyAdapter) {
        this.platform = platform;
        this.proxy = proxy;
    }
    onVmNotLaunched(): Promise<string> {
        this.proxy.logAsInfo('Noop on vm launching unsucessful.');
        return Promise.resolve('');
    }
    onLaunchingVm(): Promise<string> {
        this.proxy.logAsInfo('Noop on launching.');
        return Promise.resolve('');
    }
    onLaunchedVm(): Promise<string> {
        this.proxy.logAsInfo('Noop on launched.');
        return Promise.resolve('');
    }
    onTerminatingVm(): Promise<string> {
        this.proxy.logAsInfo('Noop on terminating.');
        return Promise.resolve('');
    }
    onTerminatedVm(): Promise<string> {
        this.proxy.logAsInfo('Noop on terminated.');
        return Promise.resolve('');
    }
    completeLaunching(success = true): Promise<string> {
        this.proxy.logAsInfo(`Noop on completeLaunching (${success})`);
        return Promise.resolve('');
    }
    completeTerminating(success = true): Promise<string> {
        this.proxy.logAsInfo(`Noop on completeLaunching (${success})`);
        return Promise.resolve('');
    }
}
