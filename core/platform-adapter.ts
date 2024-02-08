import { Settings } from './autoscale-setting';
import { Blob } from './blob';
import { ReqType } from './cloud-function-proxy';
import { NicAttachmentRecord } from './context-strategy/nic-attachment-context';
import { KeyValue } from './db-definitions';
import { JSONable } from './jsonable';
import { PlatformAdaptee } from './platform-adaptee';
import { HealthCheckRecord, PrimaryRecord } from './primary-election';
import { NetworkInterface, VirtualMachine } from './virtual-machine';

export interface DeviceSyncInfo {
    /**
     * Representing property: instance, the id of the vm.
     * Device always provides this property.
     * Can check null for errors.
     */
    instance: string;
    /**
     * Representing property: interval, in second.
     * Device always provides this property.
     * Can check NaN for errors.
     */
    interval: number;
    /**
     * Representing property: status. Not available in heartbeat type of info.
     * Will be undefined if absent.
     */
    status?: string | null;
    /**
     * Representing property: sequence.
     * If device provided this property, it will not be null.
     * If device not provided this property, it will be NaN.
     */
    sequence: number;
    /**
     * Representing property: time, the send time of the heartbeat, ISO 8601 format, device's time.
     * If device provided this property, it will not be null.
     * If device not provided this property, it will be null.
     */
    time: string;
    /**
     * Representing property: sync_time, the last time on successful ha sync, ISO 8601 format, device's time.
     * If device provided this property, it can be null.
     * If device not provided this property, it will be null.
     */
    syncTime: string | null;
    /**
     * Representing property: sync_fail_time, the last time on ha sync failure, ISO 8601 format, device's time.
     * If device provided this property, it can be null.
     * If device not provided this property, it will be null.
     */
    syncFailTime: string | null;
    /**
     * Representing property: sync_status, true or false on secondary device if in-sync with primary or not;
     * It will be null on primary device.
     * If device provided this property, it can be null.
     * If device not provided this property, it will be null.
     */
    syncStatus: boolean | null;
    /**
     * Representing property: is_primary, true for primary devices, false for secondary, in the device's perspective.
     * If device provided this property, it can be null.
     * If device not provided this property, it will be null.
     */
    isPrimary: boolean | null;
    /**
     * Representing property: checksum, the HA checksum value of the device.
     * If device provided this property, it will not be null.
     * If device not provided this property, it will be null.
     */
    checksum: string;
}
export interface ResourceFilter {
    key: string;
    value: string;
    isTag?: boolean;
}

export interface LicenseFile {
    fileName: string;
    checksum: string;
    algorithm: string;
    content: string;
}

export interface LicenseStockRecord {
    fileName: string;
    checksum: string;
    algorithm: string;
    productName: string;
}

export interface LicenseUsageRecord {
    fileName: string;
    checksum: string;
    algorithm: string;
    productName: string;
    vmId: string;
    scalingGroupName: string;
    assignedTime: number;
    vmInSync: boolean;
}

export interface TgwVpnAttachmentRecord {
    vmId: string;
    ip: string;
    vpnConnectionId: string;
    transitGatewayId: string;
    transitGatewayAttachmentId: string;
    customerGatewayId: string;
    vpnConnection: JSONable;
}

export interface PlatformAdapter {
    adaptee: PlatformAdaptee;
    readonly createTime: number;
    // checkRequestIntegrity(): void;
    init(): Promise<void>;
    saveSettingItem(
        key: string,
        value: string,
        description?: string,
        jsonEncoded?: boolean,
        editable?: boolean
    ): Promise<string>;
    getRequestType(): Promise<ReqType>;
    /**
     * heartbeat interval in the request in ms.
     * @returns number interval in ms
     */
    getReqHeartbeatInterval(): Promise<number>;
    /**
     * the device info sent from a vm
     * @returns Promise of DeviceSyncInfo
     */
    getReqDeviceSyncInfo(): Promise<DeviceSyncInfo>;
    getReqVmId(): Promise<string>;
    getReqAsString(): Promise<string>;
    getSettings(): Promise<Settings>;
    /**
     * validate settings by checking the integrity of each required setting item. Ensure that they
     * have been added properly.
     * @returns Promise
     */
    validateSettings(): Promise<boolean>;
    getTargetVm(): Promise<VirtualMachine | null>;
    getPrimaryVm(): Promise<VirtualMachine | null>;
    getVmById(vmId: string, scalingGroupName?: string): Promise<VirtualMachine | null>;
    listAutoscaleVm(
        identifyScalingGroup?: boolean,
        listNic?: boolean
    ): Promise<VirtualMachine[] | null>;
    getHealthCheckRecord(vmId: string): Promise<HealthCheckRecord | null>;
    listHealthCheckRecord(): Promise<HealthCheckRecord[] | null>;
    getPrimaryRecord(filters?: KeyValue[]): Promise<PrimaryRecord | null>;
    vmEquals(vmA?: VirtualMachine, vmB?: VirtualMachine): boolean;
    createHealthCheckRecord(rec: HealthCheckRecord): Promise<void>;
    updateHealthCheckRecord(rec: HealthCheckRecord): Promise<void>;
    deleteHealthCheckRecord(rec: HealthCheckRecord): Promise<void>;
    /**
     * create the primary record in the db system.
     * @param rec the new primary record
     * @param oldRec the old primary record, if provided, will try to replace this record by
     * matching the key properties.
     */
    createPrimaryRecord(rec: PrimaryRecord, oldRec: PrimaryRecord | null): Promise<void>;
    /**
     * update the primary record using the given rec. update only when the record key match
     * the record in the db.
     * @param rec primary record to be updated.
     */
    updatePrimaryRecord(rec: PrimaryRecord): Promise<void>;
    /**
     * delete the primary record using the given rec. delete only when the record property values
     * strictly match the record in the db.
     * @param rec primary record to be delete.
     * @param fullMatch need a full match of each property to delete
     */
    deletePrimaryRecord(rec: PrimaryRecord, fullMatch?: boolean): Promise<void>;
    /**
     * Load a configset file from blob storage
     * The blob container will use the AssetStorageContainer or CustomAssetContainer,
     * and the location prefix will use AssetStorageDirectory or CustomAssetDirectory.
     * The full file path will be: \<container\>/\<location prefix\>/configset/\<file-name\>
     * @param  {string} name the configset name
     * @param  {boolean} custom (optional) whether load it from a custom location or not
     * @returns {Promise} the configset content as a string
     */
    loadConfigSet(name: string, custom?: boolean): Promise<string>;
    /**
     * List all configset files in a specified blob container location
     * The blob container will use the AssetStorageContainer or CustomAssetContainer,
     * and the location prefix will use AssetStorageDirectory or CustomAssetDirectory.
     * There will be an optional subDirectory provided as parameter.
     * The full file path will be: \<container\>/\<location prefix\>[/\<subDirectory\>]/configset
     * @param  {string} subDirectory additional subdirectory
     * @param  {boolean} custom (optional) whether load it from a custom location or not
     * @returns {Promise} the configset content as a string
     */
    listConfigSet(subDirectory?: string, custom?: boolean): Promise<Blob[]>;
    deleteVmFromScalingGroup(vmId: string): Promise<void>;
    listLicenseFiles(
        storageContainerName: string,
        licenseDirectoryName: string
    ): Promise<LicenseFile[]>;
    listLicenseStock(productName: string): Promise<LicenseStockRecord[]>;
    listLicenseUsage(productName: string): Promise<LicenseUsageRecord[]>;
    updateLicenseStock(records: LicenseStockRecord[]): Promise<void>;
    updateLicenseUsage(
        records: { item: LicenseUsageRecord; reference: LicenseUsageRecord }[]
    ): Promise<void>;
    loadLicenseFileContent(storageContainerName: string, filePath: string): Promise<string>;

    // NOTE: are the following methods relevant to this interface or should move to
    // a more specific interface?
    listNicAttachmentRecord(): Promise<NicAttachmentRecord[]>;
    updateNicAttachmentRecord(vmId: string, nicId: string, status: string): Promise<void>;
    deleteNicAttachmentRecord(vmId: string, nicId: string): Promise<void>;
    /**
     * create a network interface
     * @param  {string} subnetId? (optional) id of subnet where the network interface is located
     * @param  {string} description? (optional) description
     * @param  {string[]} securityGroups? (optional) security groups
     * @param  {string} privateIpAddress? (optional) private ip address
     * @returns Promise
     */
    createNetworkInterface(
        subnetId?: string,
        description?: string,
        securityGroups?: string[],
        privateIpAddress?: string
    ): Promise<NetworkInterface | null>;

    deleteNetworkInterface(nicId: string): Promise<void>;
    attachNetworkInterface(vmId: string, nicId: string, index?: number): Promise<void>;
    detachNetworkInterface(vmId: string, nicId: string): Promise<void>;
    listNetworkInterfaces(tags: ResourceFilter[], status?: string): Promise<NetworkInterface[]>;
    tagNetworkInterface(nicId: string, tags: ResourceFilter[]): Promise<void>;
    registerFortiAnalyzer(
        vmId: string,
        privateIp: string,
        primary: boolean,
        vip: string
    ): Promise<void>;

    /**
     * invoke the Autoscale handler function
     * @param  {unknown} payload the payload to invoke the function
     * @param  {string} functionEndpoint the function name or fqdn of the function which is
     * depending on implementation.
     * @param  {string} invocable the pre-defined type name of features that is invocable in this
     * way.
     * @param  {number} executionTime? the accumulative execution time of one complete invocation.
     * due to cloud platform limitation, one complete invocation may have to split into two or more
     * function calls in order to get the final result.
     * @returns Promise
     */
    invokeAutoscaleFunction(
        payload: unknown,
        functionEndpoint: string,
        invocable: string,
        executionTime?: number
    ): Promise<number>;

    /**
     * create an invocation key for authentication between Autoscale Function caller and receiver.
     * @param  {unknown} payload
     * @param  {string} functionEndpoint
     * @param  {string} invocable
     * @returns string
     */
    createAutoscaleFunctionInvocationKey(
        payload: unknown,
        functionEndpoint: string,
        invocable: string
    ): string;
}
