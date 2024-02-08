/* eslint-disable @typescript-eslint/naming-convention */
import {
    AutoscaleSetting,
    AutoscaleSettingItemDictionary,
    SettingItemDictionary,
    SettingItemReference
} from '..';

export const FortiGateAutoscaleSetting: SettingItemReference = {
    ...AutoscaleSetting,
    EgressTrafficRouteTableList: 'egress-traffic-route-table',
    EnableFazIntegration: 'enable-fortianalyzer-integration',
    FortiAnalyzerHandlerName: 'faz-handler-name',
    FortiAnalyzerIp: 'faz-ip',
    FortiGateAdminPort: 'fortigate-admin-port',
    FortiGateAutoscaleSubnetIdList: 'fortigate-autoscale-subnet-id-list',
    FortiGateAutoscaleSubnetPairs: 'fortigate-autoscale-subnet-pairs',
    FortiGateAutoscaleVirtualNetworkId: 'fortigate-autoscale-virtual-network-id',
    FortiGateAutoscaleVirtualNetworkCidr: 'fortigate-autoscale-virtual-network-cidr',
    FortiGateExternalElbDns: 'fortigate-external-elb-dns',
    FortiGateInternalElbDns: 'fortigate-internal-elb-dns',
    FortiGatePskSecret: 'fortigate-psk-secret',
    FortiGateSyncInterface: 'fortigate-sync-interface',
    FortiGateTrafficPort: 'fortigate-traffic-port',
    FortiGateTrafficProtocol: 'fortigate-traffic-protocol'
};

export const FortiGateAutoscaleSettingItemDictionary: SettingItemDictionary = {
    ...AutoscaleSettingItemDictionary,
    [FortiGateAutoscaleSetting.EgressTrafficRouteTableList]: {
        keyName: FortiGateAutoscaleSetting.EgressTrafficRouteTableList,
        description:
            'The comma-separated list of route tables associated with any subnets,' +
            ' which should be configured to contain a route 0.0.0.0/0 to the' +
            ' primary FortiGate to handle egress traffic.',
        editable: false,
        jsonEncoded: false,
        booleanType: false
    },
    [FortiGateAutoscaleSetting.EnableFazIntegration]: {
        keyName: FortiGateAutoscaleSetting.EnableFazIntegration,
        description: 'Enable FortiAnalyzer integration with the Autoscale FortiGate cluster.',
        editable: false,
        jsonEncoded: false,
        booleanType: true
    },
    [FortiGateAutoscaleSetting.FortiAnalyzerHandlerName]: {
        keyName: FortiGateAutoscaleSetting.FortiAnalyzerHandlerName,
        description: 'The FortiGate Autoscale - FortiAnalyzer handler function name.',
        editable: false,
        jsonEncoded: false,
        booleanType: false
    },
    [FortiGateAutoscaleSetting.FortiAnalyzerIp]: {
        keyName: FortiGateAutoscaleSetting.FortiAnalyzerIp,
        description: 'The FortiGate Autoscale - FortiAnalyzer ip address.',
        editable: false,
        jsonEncoded: false,
        booleanType: false
    },
    [FortiGateAutoscaleSetting.FortiGateAdminPort]: {
        keyName: FortiGateAutoscaleSetting.FortiGateAdminPort,
        description: 'The port number for administrative login to a FortiGate.',
        editable: true,
        jsonEncoded: false,
        booleanType: false
    },
    [FortiGateAutoscaleSetting.FortiGateAutoscaleVirtualNetworkId]: {
        keyName: FortiGateAutoscaleSetting.FortiGateAutoscaleVirtualNetworkId,
        description: 'ID of the Virtual Network that contains FortiGate Autoscale.',
        editable: false,
        jsonEncoded: false,
        booleanType: false
    },
    [FortiGateAutoscaleSetting.FortiGateAutoscaleVirtualNetworkCidr]: {
        keyName: FortiGateAutoscaleSetting.FortiGateAutoscaleVirtualNetworkCidr,
        description: 'CIDR of the Virtual Network that contains FortiGate Autoscale.',
        editable: false,
        jsonEncoded: false,
        booleanType: false
    },
    [FortiGateAutoscaleSetting.FortiGateExternalElbDns]: {
        keyName: FortiGateAutoscaleSetting.FortiGateExternalElbDns,
        description: 'The DNS name of the elastic load balancer for the FortiGate scaling groups.',
        editable: false,
        jsonEncoded: false,
        booleanType: false
    },
    [FortiGateAutoscaleSetting.FortiGateInternalElbDns]: {
        keyName: FortiGateAutoscaleSetting.FortiGateInternalElbDns,
        description:
            'The DNS name of the internal elastic load balancer ' +
            'used by the FortiGate Autoscale solution.',
        editable: false,
        jsonEncoded: false,
        booleanType: false
    },
    [FortiGateAutoscaleSetting.FortiGatePskSecret]: {
        keyName: FortiGateAutoscaleSetting.FortiGatePskSecret,
        description: 'The PSK for FortiGate Autoscale synchronization.',
        editable: true,
        jsonEncoded: false,
        booleanType: false
    },
    [FortiGateAutoscaleSetting.FortiGateAutoscaleSubnetIdList]: {
        keyName: FortiGateAutoscaleSetting.FortiGateAutoscaleSubnetIdList,
        description: 'A comma-separated list of FortiGate Autoscale subnet IDs.',
        editable: false,
        jsonEncoded: false,
        booleanType: false
    },
    [FortiGateAutoscaleSetting.FortiGateAutoscaleSubnetPairs]: {
        keyName: FortiGateAutoscaleSetting.FortiGateAutoscaleSubnetPairs,
        description:
            'A list of paired subnets for north-south traffic routing purposes.' +
            ' Format: [{subnetId: [pairId1, pairId2, ...]}, ...]',
        editable: false,
        jsonEncoded: true,
        booleanType: false
    },
    [FortiGateAutoscaleSetting.FortiGateSyncInterface]: {
        keyName: FortiGateAutoscaleSetting.FortiGateSyncInterface,
        description: 'The interface the FortiGate uses for configuration synchronization.',
        editable: true,
        jsonEncoded: false,
        booleanType: false
    },
    [FortiGateAutoscaleSetting.FortiGateTrafficPort]: {
        keyName: FortiGateAutoscaleSetting.FortiGateTrafficPort,
        description:
            'The port number for the load balancer to route traffic through ' +
            'FortiGates to the protected services behind the load balancer.',
        editable: true,
        jsonEncoded: false,
        booleanType: false
    },
    [FortiGateAutoscaleSetting.FortiGateTrafficProtocol]: {
        keyName: FortiGateAutoscaleSetting.FortiGateTrafficProtocol,
        description:
            'The protocol for the traffic to be routed by the load balancer through ' +
            'FortiGates to the protected services behind the load balancer.',
        editable: true,
        jsonEncoded: false,
        booleanType: false
    }
};
