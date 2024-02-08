// the no-shadow rule errored in the next line may be just a false alarm
// eslint-disable-next-line no-shadow
export enum VirtualMachineState {
    // NOTE: transitioning state. in provisioning, not attached to the host, not receiving traffic.
    Creating = 'Creating',
    // NOTE: standby but stopped instead of running.
    Deallocated = 'Deallocated',
    // NOTE: a general state for all transitioning states.
    Pending = 'Pending',
    // NOTE: running, attached to the host, receiving traffic, not deleted.
    Running = 'Running',
    // NOTE: running, detached from the host, not receiving traffic, not deleted.
    Standby = 'Standby',
    // NOTE: transitioning state. starting or restarting, may or may not attach to the host, not receiving traffic, not deleted.
    Starting = 'Starting',
    // NOTE: powered off, may or may not attach to the host, not receiving traffic, not deleted.
    Stopped = 'Stopped',
    // NOTE: transitioning state. stopping, may or may not attach to the host, not receiving traffic, not deleted.
    Stopping = 'Stopping',
    // NOTE: powered off, detached from the host, not receiving traffic, deleted.
    Terminated = 'Terminated',
    // NOTE: transitioning state. in deleting, not attached to the host, not receiving traffic.
    Terminating = 'Terminating',
    // NOTE: transitioning state. standby but in the process of updating the model.
    Updating = 'Updating',
    // NOTE: a general state for any reason not set the state yet so it remains unkown.
    Unknown = 'Unknown'
}

export interface NetworkInterface {
    id: string;
    privateIpAddress: string;
    index: number;
    subnetId?: string;
    virtualNetworkId?: string;
    attachmentId?: string;
    description?: string;
}

export interface SecurityGroup {
    id: string;
    name?: string;
}

// the no-shadow rule errored in the next line may be just a false alarm
// eslint-disable-next-line no-shadow
export interface VirtualMachine {
    id: string;
    scalingGroupName: string;
    productName?: string;
    primaryPrivateIpAddress: string;
    primaryPublicIpAddress?: string;
    virtualNetworkId: string;
    subnetId: string;
    securityGroups?: SecurityGroup[];
    networkInterfaces?: NetworkInterface[];
    networkInterfaceIds?: string[];
    sourceData?: { [key: string]: unknown };
    state: VirtualMachineState;
}
