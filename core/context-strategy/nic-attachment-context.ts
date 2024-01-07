import { CloudFunctionProxyAdapter } from '../cloud-function-proxy';
import { PlatformAdapter } from '../platform-adapter';
import { VirtualMachine } from '../virtual-machine';

// the no-shadow rule errored in the next line may be just a false alarm
// eslint-disable-next-line no-shadow
export enum NicAttachmentStrategyResult {
    Success = 'success',
    Failed = 'failed',
    ShouldTerminateVm = 'should-terminate-vm',
    ShouldContinue = 'should-continue'
}

export interface NicAttachmentStrategy {
    prepare(vm: VirtualMachine): Promise<void>;
    attach(): Promise<NicAttachmentStrategyResult>;
    detach(): Promise<NicAttachmentStrategyResult>;
    cleanUp(): Promise<number>;
}

/**
 * To provide secondary network interface attachment related logics
 */
export interface NicAttachmentContext {
    handleNicAttachment(): Promise<NicAttachmentStrategyResult>;
    handleNicDetachment(): Promise<NicAttachmentStrategyResult>;
    cleanupUnusedNic(): Promise<NicAttachmentStrategyResult>;
    setNicAttachmentStrategy(strategy: NicAttachmentStrategy): void;
}

// the no-shadow rule errored in the next line may be just a false alarm
// eslint-disable-next-line no-shadow
export enum NicAttachmentStatus {
    Attaching = 'Attaching',
    Attached = 'Attached',
    Detaching = 'Detaching',
    Detached = 'Detached'
}

export interface NicAttachmentRecord {
    vmId: string;
    nicId: string;
    attachmentState: string;
}

export class NoopNicAttachmentStrategy implements NicAttachmentStrategy {
    constructor(readonly platform: PlatformAdapter, readonly proxy: CloudFunctionProxyAdapter) {}
    prepare(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        vm: VirtualMachine
    ): Promise<void> {
        return Promise.resolve();
    }
    attach(): Promise<NicAttachmentStrategyResult> {
        return Promise.resolve(NicAttachmentStrategyResult.Success);
    }
    detach(): Promise<NicAttachmentStrategyResult> {
        return Promise.resolve(NicAttachmentStrategyResult.Success);
    }
    cleanUp(): Promise<number> {
        return Promise.resolve(0);
    }
}
