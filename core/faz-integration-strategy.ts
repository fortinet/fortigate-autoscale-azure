import { VirtualMachine } from './virtual-machine';

export interface FazDeviceAuthorization {
    vmId: string;
    privateIp: string;
    publicIp: string;
}

export interface FazIntegrationStrategy {
    createAuthorizationRequest(vm: VirtualMachine): Promise<void>;
    processAuthorizationRequest(
        device: FazDeviceAuthorization,
        host: string,
        port: string,
        username: string,
        password: string
    ): Promise<void>;
}
