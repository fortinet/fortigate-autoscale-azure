import { JSONable } from './jsonable';

/**
 * Enumerated value of SettingItem keys
 *
 * @export
 * @enum {number}
 */
// the no-shadow rule errored in the next line may be just a false alarm
// eslint-disable-next-line no-shadow
export enum AutoscaleSetting {
    AdditionalConfigSetNameList = 'additional-configset-name-list',
    AutoscaleFunctionExtendExecution = 'autoscale-function-extend-execution',
    AutoscaleFunctionMaxExecutionTime = 'autoscale-function-max-execution-time',
    AutoscaleHandlerUrl = 'autoscale-handler-url',
    AssetStorageContainer = 'asset-storage-name',
    AssetStorageDirectory = 'asset-storage-key-prefix',
    ByolScalingGroupDesiredCapacity = 'byol-scaling-group-desired-capacity',
    ByolScalingGroupMinSize = 'byol-scaling-group-min-size',
    ByolScalingGroupMaxSize = 'byol-scaling-group-max-size',
    ByolScalingGroupName = 'byol-scaling-group-name',
    CustomAssetContainer = 'custom-asset-container',
    CustomAssetDirectory = 'custom-asset-directory',
    EnableExternalElb = 'enable-external-elb',
    EnableHybridLicensing = 'enable-hybrid-licensing',
    EnableInternalElb = 'enable-internal-elb',
    EnableNic2 = 'enable-second-nic',
    EnableVmInfoCache = 'enable-vm-info-cache',
    HeartbeatDelayAllowance = 'heartbeat-delay-allowance',
    HeartbeatInterval = 'heartbeat-interval',
    HeartbeatLossCount = 'heartbeat-loss-count',
    LicenseFileDirectory = 'license-file-directory',
    PrimaryElectionTimeout = 'primary-election-timeout',
    PrimaryScalingGroupName = 'primary-scaling-group-name',
    PaygScalingGroupDesiredCapacity = 'scaling-group-desired-capacity',
    PaygScalingGroupMinSize = 'scaling-group-min-size',
    PaygScalingGroupMaxSize = 'scaling-group-max-size',
    PaygScalingGroupName = 'payg-scaling-group-name',
    ResourceTagPrefix = 'resource-tag-prefix',
    SyncRecoveryCount = 'sync-recovery-count',
    TerminateUnhealthyVm = 'terminate-unhealthy-vm',
    VmInfoCacheTime = 'vm-info-cache-time',
    VpnBgpAsn = 'vpn-bgp-asn'
}

export interface SettingItemDefinition {
    keyName: string;
    description: string;
    editable: boolean;
    jsonEncoded: boolean;
    booleanType: boolean;
}

export interface SubnetPair {
    subnetId: string;
    pairIdList: string[];
}

// the no-shadow rule errored in the next line may be just a false alarm
// eslint-disable-next-line no-shadow
export enum SubnetPairIndex {
    Service,
    Management
}

/**
 *
 *
 * @export
 * @class SettingItem
 */
export class SettingItem {
    static NO_VALUE = 'n/a';
    /**
     *Creates an instance of SettingItem.
     * @param {string} key setting key
     * @param {string} rawValue the value stored as string type,
     * for actual type of : string, number, boolean, etc.
     * @param {string} description description of this setting item
     * @param {boolean} editable a flag for whether the value should be editable after deployment or not
     * @param {string} jsonEncoded a flag for whether the value is a JSON object or not.
     * If yes, can get the JSON object from
     * calling the jsonValue of this setting item.
     */
    constructor(
        readonly key: string,
        private readonly rawValue: string,
        readonly description: string,
        readonly editable: boolean,
        readonly jsonEncoded: boolean
    ) {}
    /**
     * the string type value of the setting.
     *
     * @readonly
     * @type {string}
     */
    get value(): string {
        return this.rawValue.trim().toLowerCase() === SettingItem.NO_VALUE ? null : this.rawValue;
    }
    /**
     * Returns the object type of this setting if it is a JSON object,
     * or null if it isn't.
     *
     * @readonly
     * @type {{}}
     */
    get jsonValue(): JSONable {
        if (this.jsonEncoded) {
            try {
                return JSON.parse(this.value);
            } catch (error) {
                return null;
            }
        } else {
            return null;
        }
    }
    /**
     * Returns a truth value if the value of this setting is either a string 'true' or 'false'.
     * It's handy to be used in boolean comparisons.
     *
     * @readonly
     * @type {boolean}
     */
    get truthValue(): boolean {
        return this.value && this.value.trim().toLowerCase() === 'true';
    }

    /**
     * stringify this SettingItem
     * @returns {string} string
     */
    stringify(): string {
        return JSON.stringify({
            key: this.key,
            value: this.rawValue,
            description: this.description,
            editable: this.editable,
            jsonEncoded: this.jsonEncoded
        });
    }

    /**
     * parse a string as a SettingItem
     *
     * @static
     * @param {string} s string to parse
     * @returns {SettingItem} settingitem object
     */
    static parse(s: string): SettingItem {
        const o = JSON.parse(s);
        const k = Object.keys(o);
        if (
            !(
                k.includes('key') &&
                k.includes('value') &&
                k.includes('description') &&
                k.includes('editable') &&
                k.includes('jsonEncoded')
            )
        ) {
            throw new Error(
                `Unable to parse string (${s}) to SettingItem. Missing required properties.`
            );
        }
        return new SettingItem(o.key, o.value, o.description, o.editable, o.jsonEncoded);
    }
}

export type Settings = Map<string, SettingItem>;

export interface SettingItemReference {
    [key: string]: string;
}

export interface SettingItemDictionary {
    [key: string]: SettingItemDefinition;
}

export const AutoscaleSettingItemDictionary: SettingItemDictionary = {
    [AutoscaleSetting.AdditionalConfigSetNameList]: {
        keyName: AutoscaleSetting.AdditionalConfigSetNameList,
        description:
            'The comma-separated list of the name of a configset. These configsets' +
            ' are required dependencies for the Autoscale to work for a certain ' +
            ' deployment. Can be left empty.',
        editable: false,
        jsonEncoded: false,
        booleanType: false
    },
    [AutoscaleSetting.AutoscaleFunctionExtendExecution]: {
        keyName: AutoscaleSetting.AutoscaleFunctionExtendExecution,
        description:
            'Allow one single Autoscale function to be executed in multiple extended invocations' +
            ' of a cloud platform function if it cannot finish within one invocation and its' +
            ' functionality supports splitting into extended invocations.',
        editable: true,
        jsonEncoded: false,
        booleanType: true
    },
    [AutoscaleSetting.AutoscaleFunctionMaxExecutionTime]: {
        keyName: AutoscaleSetting.AutoscaleFunctionMaxExecutionTime,
        description:
            'Maximum execution time (in second) allowed for an Autoscale Cloud Function that can' +
            ' run in one cloud function invocation or multiple extended invocations.',
        editable: true,
        jsonEncoded: false,
        booleanType: false
    },
    [AutoscaleSetting.AutoscaleHandlerUrl]: {
        keyName: AutoscaleSetting.AutoscaleHandlerUrl,
        description:
            'The Autoscale handler (cloud function) URL as the communication endpoint between' +
            'Autoscale and device in the scaling group(s).',
        editable: false,
        jsonEncoded: false,
        booleanType: false
    },
    [AutoscaleSetting.AssetStorageContainer]: {
        keyName: AutoscaleSetting.AssetStorageContainer,
        description: 'Asset storage name.',
        editable: false,
        jsonEncoded: false,
        booleanType: false
    },
    [AutoscaleSetting.AssetStorageDirectory]: {
        keyName: AutoscaleSetting.AssetStorageDirectory,
        description: 'Asset storage key prefix.',
        editable: false,
        jsonEncoded: false,
        booleanType: false
    },
    [AutoscaleSetting.ByolScalingGroupDesiredCapacity]: {
        keyName: AutoscaleSetting.ByolScalingGroupDesiredCapacity,
        description: 'BYOL Scaling group desired capacity.',
        editable: true,
        jsonEncoded: false,
        booleanType: false
    },
    [AutoscaleSetting.ByolScalingGroupMinSize]: {
        keyName: AutoscaleSetting.ByolScalingGroupMinSize,
        description: 'BYOL Scaling group min size.',
        editable: true,
        jsonEncoded: false,
        booleanType: false
    },
    [AutoscaleSetting.ByolScalingGroupMaxSize]: {
        keyName: AutoscaleSetting.ByolScalingGroupMaxSize,
        description: 'BYOL Scaling group max size.',
        editable: true,
        jsonEncoded: false,
        booleanType: false
    },
    [AutoscaleSetting.ByolScalingGroupName]: {
        keyName: AutoscaleSetting.ByolScalingGroupName,
        description: 'The name of the BYOL auto scaling group.',
        editable: true,
        jsonEncoded: false,
        booleanType: false
    },
    [AutoscaleSetting.CustomAssetContainer]: {
        keyName: AutoscaleSetting.CustomAssetContainer,
        description:
            'The asset storage name for some user custom resources, such as: custom configset, license files, etc.',
        editable: true,
        jsonEncoded: false,
        booleanType: false
    },
    [AutoscaleSetting.CustomAssetDirectory]: {
        keyName: AutoscaleSetting.CustomAssetDirectory,
        description:
            'The sub directory to the user custom resources under the custom-asset-container.',
        editable: true,
        jsonEncoded: false,
        booleanType: false
    },
    [AutoscaleSetting.EnableExternalElb]: {
        keyName: AutoscaleSetting.EnableExternalElb,
        description:
            'Toggle ON / OFF the external elastic load balancing for device in the external-facing Autoscale scaling group(s).',
        editable: false,
        jsonEncoded: false,
        booleanType: true
    },
    [AutoscaleSetting.EnableHybridLicensing]: {
        keyName: AutoscaleSetting.EnableHybridLicensing,
        description: 'Toggle ON / OFF the hybrid licensing feature.',
        editable: false,
        jsonEncoded: false,
        booleanType: true
    },
    [AutoscaleSetting.EnableInternalElb]: {
        keyName: AutoscaleSetting.EnableInternalElb,
        description:
            'Toggle ON / OFF the internal elastic load balancing feature to allow traffic flow out' +
            ' the device in the Autoscale scaling groups(s) into an internal load balancer.',
        editable: false,
        jsonEncoded: false,
        booleanType: true
    },
    [AutoscaleSetting.EnableNic2]: {
        keyName: AutoscaleSetting.EnableNic2,
        description:
            'Toggle ON / OFF the secondary eni creation on each device in the Autoscale scaling group(s).',
        editable: false,
        jsonEncoded: false,
        booleanType: true
    },
    [AutoscaleSetting.EnableVmInfoCache]: {
        keyName: AutoscaleSetting.EnableVmInfoCache,
        description:
            'Toggle ON / OFF the vm info cache feature. It caches the ' +
            'vm info in db to reduce API calls to query a vm from the platform.',
        editable: false,
        jsonEncoded: false,
        booleanType: true
    },
    [AutoscaleSetting.HeartbeatDelayAllowance]: {
        keyName: AutoscaleSetting.HeartbeatDelayAllowance,
        description:
            'The maximum amount of time (in seconds) allowed for network latency of the Autoscale' +
            ' device heartbeat arriving at the Autoscale handler.',
        editable: true,
        jsonEncoded: false,
        booleanType: false
    },
    [AutoscaleSetting.HeartbeatInterval]: {
        keyName: AutoscaleSetting.HeartbeatInterval,
        description:
            'The length of time (in seconds) that an Autoscale device waits between' +
            ' sending heartbeat requests to the Autoscale handler.',
        editable: true,
        jsonEncoded: false,
        booleanType: false
    },
    [AutoscaleSetting.HeartbeatLossCount]: {
        keyName: AutoscaleSetting.HeartbeatLossCount,
        description:
            'Number of consecutively lost heartbeats.' +
            ' When the Heartbeat Loss Count has been reached,' +
            ' the device is deemed unhealthy and fail-over activities will commence.',
        editable: true,
        jsonEncoded: false,
        booleanType: false
    },
    [AutoscaleSetting.LicenseFileDirectory]: {
        keyName: AutoscaleSetting.LicenseFileDirectory,
        description: 'The sub directory for storing license files under the asset container.',
        editable: true,
        jsonEncoded: false,
        booleanType: false
    },
    [AutoscaleSetting.PrimaryElectionTimeout]: {
        keyName: AutoscaleSetting.PrimaryElectionTimeout,
        description: 'The maximum time (in seconds) to wait for a primary election to complete.',
        editable: true,
        jsonEncoded: false,
        booleanType: false
    },
    [AutoscaleSetting.PrimaryScalingGroupName]: {
        keyName: AutoscaleSetting.PrimaryScalingGroupName,
        description: 'The name of the primary auto scaling group.',
        editable: false,
        jsonEncoded: false,
        booleanType: false
    },
    [AutoscaleSetting.PaygScalingGroupDesiredCapacity]: {
        keyName: AutoscaleSetting.PaygScalingGroupDesiredCapacity,
        description: 'PAYG Scaling group desired capacity.',
        editable: true,
        jsonEncoded: false,
        booleanType: false
    },
    [AutoscaleSetting.PaygScalingGroupMinSize]: {
        keyName: AutoscaleSetting.PaygScalingGroupMinSize,
        description: 'PAYG Scaling group min size.',
        editable: true,
        jsonEncoded: false,
        booleanType: false
    },
    [AutoscaleSetting.PaygScalingGroupMaxSize]: {
        keyName: AutoscaleSetting.PaygScalingGroupMaxSize,
        description: 'PAYG Scaling group max size.',
        editable: false,
        jsonEncoded: false,
        booleanType: false
    },
    [AutoscaleSetting.PaygScalingGroupName]: {
        keyName: AutoscaleSetting.PaygScalingGroupName,
        description: 'The name of the PAYG auto scaling group.',
        editable: false,
        jsonEncoded: false,
        booleanType: false
    },
    [AutoscaleSetting.ResourceTagPrefix]: {
        keyName: AutoscaleSetting.ResourceTagPrefix,
        description:
            'Resource tag prefix. Used on any resource that supports tagging or labeling.' +
            ' Such resource will be given a tag or label starting with this prefix.' +
            ' Also used as the name of the logical group for Autoscale resources' +
            ' in those cloud platforms which support such logical grouping.',
        editable: true,
        jsonEncoded: false,
        booleanType: false
    },
    [AutoscaleSetting.SyncRecoveryCount]: {
        keyName: AutoscaleSetting.SyncRecoveryCount,
        description:
            'The number (positive integer) of on-time heartbeat for a vm needs to send to ' +
            ' recover from the unhealthy state. Unhealthy vm will be excluded from being' +
            ' candidate of primary elections.',
        editable: true,
        jsonEncoded: false,
        booleanType: false
    },
    [AutoscaleSetting.TerminateUnhealthyVm]: {
        keyName: AutoscaleSetting.TerminateUnhealthyVm,
        description:
            'Toggle for unhealthy vm handling behaviours. Set to true to terminate unhealthy vm' +
            ' or set to false to keep the unhealthy vm.',
        editable: true,
        jsonEncoded: false,
        booleanType: true
    },
    [AutoscaleSetting.VpnBgpAsn]: {
        keyName: AutoscaleSetting.VpnBgpAsn,
        description: 'The BGP Autonomous System Number used with the VPN connections.',
        editable: true,
        jsonEncoded: false,
        booleanType: false
    },
    [AutoscaleSetting.VmInfoCacheTime]: {
        keyName: AutoscaleSetting.VmInfoCacheTime,
        description: 'The vm info cache time in seconds.',
        editable: true,
        jsonEncoded: false,
        booleanType: false
    }
};
