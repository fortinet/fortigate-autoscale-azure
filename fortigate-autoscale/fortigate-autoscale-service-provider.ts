import { AutoscaleServiceType } from '../core';

// all supported FortiGate Autoscale Service type
export const FortiGateAutoscaleServiceType = {
    ...AutoscaleServiceType,
    RegisterFortiAnalyzer: 'registerFortiAnalyzer',
    TriggerFazDeviceAuth: 'triggerFazDeviceAuth'
};
// the no-shadow rule errored in the next line may be just a false alarm
// eslint-disable-next-line no-shadow
export enum FortiGateAutoscaleServiceRequestSource {
    FortiGateAutoscale = 'fortinet.autoscale'
}
