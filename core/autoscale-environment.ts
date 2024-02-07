import { HealthCheckRecord, PrimaryRecord } from './primary-election';
import { VirtualMachine } from './virtual-machine';

export interface AutoscaleEnvironment {
    primaryId?: string;
    primaryVm?: VirtualMachine;
    primaryScalingGroup?: string;
    primaryHealthCheckRecord?: HealthCheckRecord;
    primaryRecord: PrimaryRecord;
    primaryRoleChanged?: boolean;
    targetId?: string;
    targetVm?: VirtualMachine;
    targetScalingGroup?: string;
    targetHealthCheckRecord?: HealthCheckRecord;
    [key: string]: unknown;
}
