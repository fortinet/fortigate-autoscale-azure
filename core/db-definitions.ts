export interface KeyValue {
    key: string;
    value: string;
}

// the no-shadow rule errored in the next line may be just a false alarm
// eslint-disable-next-line no-shadow
export enum TypeRef {
    StringType = 'AutoscaleStringType',
    NumberType = 'AutoscaleStringType',
    BooleanType = 'AutoscaleBooleanType',
    PrimaryKey = 'AutoscaleStringType',
    SecondaryKey = 'AutoscaleStringType'
}

export interface SchemaElement {
    name: string;
    keyType: TypeRef | string;
}
export type TypeRefMap = Map<TypeRef, string>;

export interface Attribute {
    name: string;
    attrType: TypeRef | string;
    isKey: boolean;
    keyType?: TypeRef | string;
}

export interface Record {
    [key: string]: string | number | boolean;
}

/**
 * DB save data condition
 * @enum {string}
 */
// the no-shadow rule errored in the next line may be just a false alarm
// eslint-disable-next-line no-shadow
export enum SaveCondition {
    /**
     * @member {string} InsertOnly strictly insert only if not exists
     */
    InsertOnly = 'InsertOnly',
    /**
     * @member {string} UpdateOnly strictly update only if exists
     */
    UpdateOnly = 'UpdateOnly',
    /**
     * @member {string} Upsert insert if not exists or update if exists
     */
    Upsert = 'Upsert'
}

/**
 * must be implement to provide platform specific data type conversion
 *
 * @export
 * @abstract
 * @class TypeConvert
 */
export abstract class TypeConverter {
    /**
     * convert a value of string type stored in the db to a js primitive string type
     *
     * @abstract
     * @param {unknown} value
     * @returns {string}
     */
    abstract valueToString(value: unknown): string;
    /**
     * convert a value of number type stored in the db to a js primitive number type
     *
     * @abstract
     * @param {unknown} value
     * @returns {number}
     */
    abstract valueToNumber(value: unknown): number;
    /**
     * convert a value of boolean type stored in the db to a js boolean primitive type
     *
     * @abstract
     * @param {unknown} value
     * @returns {boolean}
     */
    abstract valueToBoolean(value: unknown): boolean;
}

export interface BidirectionalCastable<PARENT, CHILD> {
    /**
     * a downcast converts a db record from a parent structure to a child structure by updating the
     * properties with the same name, setting the child's own properties, then returns the child.
     * @param  {PARENT} record the record using PARENT interface
     * @returns {CHILD} a record using CHILD interface
     */
    downcast(record: PARENT): CHILD;
    /**
     * an upcast converts a db record from a child structure to a parent structure by updating the
     * properties with the same name, then returns the parent.
     * @param  {CHILD} record the record using CHILD interface
     * @returns {PARENT} a record using PARENT interface
     */
    upcast(record: CHILD): PARENT;
}

export class DbError extends Error {
    constructor(readonly code: string, message: string) {
        super(message);
    }
}

// the no-shadow rule errored in the next line may be just a false alarm
// eslint-disable-next-line no-shadow
export enum DbErrorCode {
    NotFound = 'NotFound',
    KeyConflict = 'KeyConflict',
    InconsistentData = 'InconsistentData',
    UnexpectedResponse = 'UnexpectedResponse'
}

export class DbReadError extends DbError {}
export class DbSaveError extends DbError {}
export class DbDeleteError extends DbError {}

export abstract class Table<T> {
    static TypeRefMap: Map<TypeRef, string> = new Map<TypeRef, string>([
        [TypeRef.StringType, 'String'],
        [TypeRef.NumberType, 'Number'],
        [TypeRef.BooleanType, 'Boolean'],
        [TypeRef.PrimaryKey, 'PrimaryKey'],
        [TypeRef.SecondaryKey, 'SecondaryKey']
    ]);
    private _name: string;
    protected _schema: Map<string, SchemaElement>;
    protected _keys: Map<string, Attribute>;
    protected _attributes: Map<string, Attribute>;
    constructor(
        readonly typeConvert: TypeConverter,
        readonly namePrefix: string = '',
        readonly nameSuffix: string = ''
    ) {
        this._attributes = new Map<string, Attribute>();
    }
    /**
     * validate the input before putting into the database
     * @param {TI} input the input object to be validated
     * @throws an Error object
     */
    validateInput<TI>(input: TI): void {
        const keys = Object.keys(input);
        this.attributes.forEach(attrName => {
            if (!keys.includes) {
                throw new Error(`Table [${this.name}] required attribute [${attrName}] not found.`);
            }
        });
    }

    /**
     * Set the name of the table (not include prefix or suffix)
     * @param {string} n name of the table
     */
    protected setName(n: string): void {
        this._name = n;
    }
    /**
     * Table name (with prefix and suffix if provided)
     */
    get name(): string {
        return (
            this.namePrefix +
            (this.namePrefix ? '-' : '') +
            this._name +
            (this.nameSuffix ? '-' : '') +
            this.nameSuffix
        );
    }
    /**
     * Table schema
     */
    get schema(): Map<string, SchemaElement> {
        if (!this._schema) {
            this._schema = new Map(
                Array.from(this._attributes.values())
                    .filter(attr => attr.isKey)
                    .map(a => [
                        a.name,
                        {
                            name: a.name,
                            keyType: a.keyType
                        } as SchemaElement
                    ])
            );
        }
        return this._schema;
    }
    /**
     * Table Key attributes
     */
    get keys(): Map<string, Attribute> {
        if (!this._keys) {
            this._keys = new Map(
                Array.from(this._attributes.values())
                    .filter(attr => attr.isKey)
                    .map(a => [a.name, a])
            );
        }
        return this._keys;
    }
    /**
     * Table all attributes including key attributes
     */
    get attributes(): Map<string, Attribute> {
        return this._attributes;
    }

    get primaryKey(): Attribute {
        const [pk] = Array.from(this.keys.values()).filter(
            key => key.keyType === TypeRef.PrimaryKey
        );
        return pk;
    }

    /**
     * Alter the type of each attribute using a given type reference map.
     * Every attribute in the Autoscale generic Table uses a TypeRef refernce as its type.
     * The reason is table attribute type and key type may vary in different platforms,
     * the platform-specific derived Table classes are intended to be a concrete class
     * with a determined type.
     * @param {TypeRefMap} typeRefs attribute type reference map
     */
    protected alterAttributesUsingTypeReference(typeRefs: TypeRefMap): void {
        const typeRefValues = Object.values<string>(TypeRef);
        Array.from(this._attributes.keys()).forEach(name => {
            const attr = this._attributes.get(name);
            if (attr.keyType && typeRefValues.indexOf(attr.keyType)) {
                attr.keyType = typeRefs.get(attr.keyType as TypeRef);
            }
            if (attr.attrType && typeRefValues.indexOf(attr.attrType)) {
                attr.attrType = typeRefs.get(attr.attrType as TypeRef);
            }
            this._attributes.set(attr.name, attr);
        });
    }
    /**
     * Alter the table attribute definitions. Provide ability to change db definition in a derived
     * class for a certain platform.
     * @param {Attribute[]} definitions new definitions to use
     */
    alterAttributes(definitions: Attribute[]): void {
        let dirty = false;
        definitions.forEach(def => {
            if (this._attributes.has(def.name)) {
                dirty = true;
                const attr: Attribute = {
                    name: def.name,
                    isKey: def.isKey,
                    attrType: def.attrType
                };
                if (def.isKey && def.keyType) {
                    attr.keyType = def.keyType;
                }
                this._attributes.set(attr.name, attr);
            }
        });
        // recreate key and schema
        if (dirty) {
            this._keys = null;
            this._schema = null;
        }
    }
    addAttribute(def: Attribute): void {
        const attr: Attribute = {
            name: def.name,
            isKey: def.isKey,
            attrType: def.attrType
        };
        if (def.isKey && def.keyType) {
            attr.keyType = def.keyType;
        }
        this._attributes.set(attr.name, attr);
    }
    // NOTE: no deleting attribute method should be provided.
    abstract convertRecord(record: Record): T;
    assign(target: T, record: Record): void {
        for (const p in Object.keys(target)) {
            if (typeof p === 'string') {
                target[p] = this.typeConvert.valueToString(record[p]);
            } else if (typeof p === 'number') {
                target[p] = this.typeConvert.valueToNumber(record[p]);
            } else if (typeof p === 'boolean') {
                target[p] = this.typeConvert.valueToBoolean(record[p]);
            }
        }
    }
}
export interface AutoscaleDbItem extends Record {
    vmId: string;
    scalingGroupName: string;
    ip: string;
    primaryIp: string;
    heartBeatInterval: number;
    heartBeatLossCount: number;
    nextHeartBeatTime: number;
    syncState: string;
    syncRecoveryCount: number;
    seq: number;
    sendTime: string;
    deviceSyncTime: string;
    deviceSyncFailTime: string;
    deviceSyncStatus: string;
    deviceIsPrimary: string;
    deviceChecksum: string;
}

export class Autoscale extends Table<AutoscaleDbItem> {
    static ownStaticAttributes: Attribute[] = [
        {
            name: 'vmId',
            attrType: TypeRef.StringType,
            isKey: true,
            keyType: TypeRef.PrimaryKey
        },
        {
            name: 'scalingGroupName',
            attrType: TypeRef.StringType,
            isKey: false
        },
        {
            name: 'ip',
            attrType: TypeRef.StringType,
            isKey: false
        },
        {
            name: 'primaryIp',
            attrType: TypeRef.StringType,
            isKey: false
        },
        {
            name: 'heartBeatLossCount',
            attrType: TypeRef.NumberType,
            isKey: false
        },
        {
            name: 'heartBeatInterval',
            attrType: TypeRef.NumberType,
            isKey: false
        },
        {
            name: 'nextHeartBeatTime',
            attrType: TypeRef.NumberType,
            isKey: false
        },
        {
            name: 'syncState',
            attrType: TypeRef.StringType,
            isKey: false
        },
        {
            name: 'syncRecoveryCount',
            attrType: TypeRef.NumberType,
            isKey: false
        },
        {
            name: 'seq',
            attrType: TypeRef.StringType,
            isKey: false
        },
        {
            name: 'sendTime',
            attrType: TypeRef.StringType,
            isKey: false
        },
        {
            name: 'deviceSyncTime',
            attrType: TypeRef.StringType,
            isKey: false
        },
        {
            name: 'deviceSyncFailTime',
            attrType: TypeRef.StringType,
            isKey: false
        },
        {
            name: 'deviceSyncStatus',
            attrType: TypeRef.StringType,
            isKey: false
        },
        {
            name: 'deviceIsPrimary',
            attrType: TypeRef.StringType,
            isKey: false
        },
        {
            name: 'deviceChecksum',
            attrType: TypeRef.StringType,
            isKey: false
        }
    ];
    constructor(typeConvert, namePrefix = '', nameSuffix = '') {
        super(typeConvert, namePrefix, nameSuffix);
        // CAUTION: don't forget to set a correct name.
        this.setName('Autoscale');
        Autoscale.ownStaticAttributes.forEach(def => {
            this.addAttribute(def);
        });
    }
    convertRecord(record: Record): AutoscaleDbItem {
        const item: AutoscaleDbItem = {
            vmId: this.typeConvert.valueToString(record.vmId),
            scalingGroupName: this.typeConvert.valueToString(record.scalingGroupName),
            ip: this.typeConvert.valueToString(record.ip),
            primaryIp: this.typeConvert.valueToString(record.primaryIp),
            heartBeatLossCount: this.typeConvert.valueToNumber(record.heartBeatLossCount),
            heartBeatInterval: this.typeConvert.valueToNumber(record.heartBeatInterval),
            nextHeartBeatTime: this.typeConvert.valueToNumber(record.nextHeartBeatTime),
            syncState: this.typeConvert.valueToString(record.syncState),
            syncRecoveryCount: this.typeConvert.valueToNumber(record.syncRecoveryCount),
            seq: this.typeConvert.valueToNumber(record.seq),
            sendTime: this.typeConvert.valueToString(record.sendTime),
            deviceSyncTime: this.typeConvert.valueToString(record.deviceSyncTime),
            deviceSyncFailTime: this.typeConvert.valueToString(record.deviceSyncFailTime),
            deviceSyncStatus: this.typeConvert.valueToString(record.deviceSyncStatus),
            deviceIsPrimary: this.typeConvert.valueToString(record.deviceIsPrimary),
            deviceChecksum: this.typeConvert.valueToString(record.deviceChecksum)
        };
        return item;
    }
}
export interface PrimaryElectionDbItem extends Record {
    scalingGroupName: string;
    vmId: string;
    id: string;
    ip: string;
    virtualNetworkId: string;
    subnetId: string;
    voteEndTime: number;
    voteState: string;
}
export class PrimaryElection extends Table<PrimaryElectionDbItem> {
    static ownStaticAttributes: Attribute[] = [
        {
            name: 'id',
            attrType: TypeRef.StringType,
            isKey: true,
            keyType: TypeRef.PrimaryKey
        },
        {
            name: 'scalingGroupName',
            attrType: TypeRef.StringType,
            isKey: false
        },
        {
            name: 'vmId',
            attrType: TypeRef.StringType,
            isKey: false
        },
        {
            name: 'ip',
            attrType: TypeRef.StringType,
            isKey: false
        },
        {
            name: 'virtualNetworkId',
            attrType: TypeRef.StringType,
            isKey: false
        },
        {
            name: 'subnetId',
            attrType: TypeRef.StringType,
            isKey: false
        },
        {
            name: 'voteEndTime',
            attrType: TypeRef.NumberType,
            isKey: false
        },
        {
            name: 'voteState',
            attrType: TypeRef.StringType,
            isKey: false
        }
    ];
    constructor(typeConvert, namePrefix = '', nameSuffix = '') {
        super(typeConvert, namePrefix, nameSuffix);
        // CAUTION: don't forget to set a correct name.
        this.setName('PrimaryElection');
        PrimaryElection.ownStaticAttributes.forEach(def => {
            this.addAttribute(def);
        });
    }
    convertRecord(record: Record): PrimaryElectionDbItem {
        const item: PrimaryElectionDbItem = {
            scalingGroupName: this.typeConvert.valueToString(record.scalingGroupName),
            vmId: this.typeConvert.valueToString(record.vmId),
            id: this.typeConvert.valueToString(record.id),
            ip: this.typeConvert.valueToString(record.ip),
            virtualNetworkId: this.typeConvert.valueToString(record.virtualNetworkId),
            subnetId: this.typeConvert.valueToString(record.subnetId),
            voteEndTime: this.typeConvert.valueToNumber(record.voteEndTime),
            voteState: this.typeConvert.valueToString(record.voteState)
        };
        return item;
    }
}
export interface FortiAnalyzerDbItem extends Record {
    vmId: string;
    ip: string;
    primary: boolean;
    vip: string;
}

export class FortiAnalyzer extends Table<FortiAnalyzerDbItem> {
    static ownStaticAttributes: Attribute[] = [
        {
            name: 'vmId',
            attrType: TypeRef.StringType,
            isKey: true,
            keyType: TypeRef.PrimaryKey
        },
        {
            name: 'ip',
            attrType: TypeRef.StringType,
            isKey: false
        },
        {
            name: 'primary',
            attrType: TypeRef.BooleanType,
            isKey: false
        },
        {
            name: 'vip',
            attrType: TypeRef.StringType,
            isKey: false
        }
    ];
    constructor(typeConvert, namePrefix = '', nameSuffix = '') {
        super(typeConvert, namePrefix, nameSuffix);
        // CAUTION: don't forget to set a correct name.
        this.setName('FortiAnalyzer');
        FortiAnalyzer.ownStaticAttributes.forEach(def => {
            this.addAttribute(def);
        });
    }
    convertRecord(record: Record): FortiAnalyzerDbItem {
        const item: FortiAnalyzerDbItem = {
            vmId: this.typeConvert.valueToString(record.vmId),
            ip: this.typeConvert.valueToString(record.ip),
            primary: this.typeConvert.valueToBoolean(record.primary),
            vip: this.typeConvert.valueToString(record.vip)
        };
        return item;
    }
}
export interface SettingsDbItem extends Record {
    settingKey: string;
    settingValue: string;
    description: string;
    jsonEncoded: boolean;
    editable: boolean;
}
export class Settings extends Table<SettingsDbItem> {
    static ownStaticAttributes: Attribute[] = [
        {
            name: 'settingKey',
            attrType: TypeRef.StringType,
            isKey: true,
            keyType: TypeRef.PrimaryKey
        },
        {
            name: 'settingValue',
            attrType: TypeRef.StringType,
            isKey: false
        },
        {
            name: 'description',
            attrType: TypeRef.StringType,
            isKey: false
        },
        {
            name: 'jsonEncoded',
            attrType: TypeRef.BooleanType,
            isKey: false
        },
        {
            name: 'editable',
            attrType: TypeRef.BooleanType,
            isKey: false
        }
    ];
    constructor(typeConvert, namePrefix = '', nameSuffix = '') {
        super(typeConvert, namePrefix, nameSuffix);
        // CAUTION: don't forget to set a correct name.
        this.setName('Settings');
        Settings.ownStaticAttributes.forEach(def => {
            this.addAttribute(def);
        });
    }
    convertRecord(record: Record): SettingsDbItem {
        const item: SettingsDbItem = {
            settingKey: this.typeConvert.valueToString(record.settingKey),
            settingValue: this.typeConvert.valueToString(record.settingValue),
            description: this.typeConvert.valueToString(record.description),
            jsonEncoded: this.typeConvert.valueToBoolean(record.jsonEncoded),
            editable: this.typeConvert.valueToBoolean(record.editable)
        };
        return item;
    }
}
export interface NicAttachmentDbItem extends Record {
    vmId: string;
    nicId: string;
    attachmentState: string;
}
export class NicAttachment extends Table<NicAttachmentDbItem> {
    static ownStaticAttributes: Attribute[] = [
        {
            name: 'vmId',
            attrType: TypeRef.StringType,
            isKey: true,
            keyType: TypeRef.PrimaryKey
        },
        {
            name: 'nicId',
            attrType: TypeRef.StringType,
            isKey: false
        },
        {
            name: 'attachmentState',
            attrType: TypeRef.StringType,
            isKey: false
        }
    ];
    constructor(typeConvert, namePrefix = '', nameSuffix = '') {
        super(typeConvert, namePrefix, nameSuffix);
        // CAUTION: don't forget to set a correct name.
        this.setName('NicAttachment');
        NicAttachment.ownStaticAttributes.forEach(def => {
            this.addAttribute(def);
        });
    }
    convertRecord(record: Record): NicAttachmentDbItem {
        const item: NicAttachmentDbItem = {
            vmId: this.typeConvert.valueToString(record.vmId),
            nicId: this.typeConvert.valueToString(record.nicId),
            attachmentState: this.typeConvert.valueToString(record.attachmentState)
        };
        return item;
    }
}

export interface VmInfoCacheDbItem extends Record {
    id: string;
    vmId: string;
    index: number;
    scalingGroupName: string;
    info: string;
    timestamp: number;
    expireTime: number;
}
export class VmInfoCache extends Table<VmInfoCacheDbItem> {
    static ownStaticAttributes: Attribute[] = [
        {
            name: 'id',
            attrType: TypeRef.StringType,
            isKey: true,
            keyType: TypeRef.PrimaryKey
        },
        {
            name: 'vmId',
            attrType: TypeRef.StringType,
            isKey: false
        },
        {
            name: 'index',
            attrType: TypeRef.NumberType,
            isKey: false
        },
        {
            name: 'scalingGroupName',
            attrType: TypeRef.StringType,
            isKey: false
        },
        {
            name: 'info',
            attrType: TypeRef.StringType,
            isKey: false
        },
        {
            name: 'timestamp',
            attrType: TypeRef.NumberType,
            isKey: false
        },
        {
            name: 'expireTime',
            attrType: TypeRef.NumberType,
            isKey: false
        }
    ];
    constructor(typeConvert, namePrefix = '', nameSuffix = '') {
        super(typeConvert, namePrefix, nameSuffix);
        // CAUTION: don't forget to set a correct name.
        this.setName('VmInfoCache');
        VmInfoCache.ownStaticAttributes.forEach(def => {
            this.addAttribute(def);
        });
    }
    convertRecord(record: Record): VmInfoCacheDbItem {
        const item: VmInfoCacheDbItem = {
            id: this.typeConvert.valueToString(record.id),
            vmId: this.typeConvert.valueToString(record.vmId),
            index: this.typeConvert.valueToNumber(record.index),
            scalingGroupName: this.typeConvert.valueToString(record.scalingGroupName),
            info: this.typeConvert.valueToString(record.info),
            timestamp: this.typeConvert.valueToNumber(record.timestamp),
            expireTime: this.typeConvert.valueToNumber(record.expireTime)
        };
        return item;
    }
}

export interface LicenseStockDbItem extends Record {
    checksum: string;
    algorithm: string;
    fileName: string;
    productName: string;
}
export class LicenseStock extends Table<LicenseStockDbItem> {
    static ownStaticAttributes: Attribute[] = [
        {
            name: 'checksum',
            attrType: TypeRef.StringType,
            isKey: true,
            keyType: TypeRef.PrimaryKey
        },
        {
            name: 'algorithm',
            attrType: TypeRef.StringType,
            isKey: false
        },
        {
            name: 'fileName',
            attrType: TypeRef.StringType,
            isKey: false
        },
        {
            name: 'productName',
            attrType: TypeRef.StringType,
            isKey: false
        }
    ];
    constructor(typeConvert, namePrefix = '', nameSuffix = '') {
        super(typeConvert, namePrefix, nameSuffix);
        // CAUTION: don't forget to set a correct name.
        this.setName('LicenseStock');
        LicenseStock.ownStaticAttributes.forEach(def => {
            this.addAttribute(def);
        });
    }
    convertRecord(record: Record): LicenseStockDbItem {
        const item: LicenseStockDbItem = {
            checksum: this.typeConvert.valueToString(record.checksum),
            algorithm: this.typeConvert.valueToString(record.algorithm),
            fileName: this.typeConvert.valueToString(record.fileName),
            productName: this.typeConvert.valueToString(record.productName)
        };
        return item;
    }
}

export interface LicenseUsageDbItem extends Record {
    checksum: string;
    algorithm: string;
    fileName: string;
    productName: string;
    vmId: string;
    scalingGroupName: string;
    assignedTime: number;
    vmInSync: boolean;
}
export class LicenseUsage extends Table<LicenseUsageDbItem> {
    static ownStaticAttributes: Attribute[] = [
        {
            name: 'checksum',
            attrType: TypeRef.StringType,
            isKey: true,
            keyType: TypeRef.PrimaryKey
        },
        {
            name: 'fileName',
            attrType: TypeRef.StringType,
            isKey: false
        },
        {
            name: 'algorithm',
            attrType: TypeRef.StringType,
            isKey: false
        },
        {
            name: 'vmId',
            attrType: TypeRef.StringType,
            isKey: false
        },
        {
            name: 'scalingGroupName',
            attrType: TypeRef.StringType,
            isKey: false
        },
        {
            name: 'productName',
            attrType: TypeRef.StringType,
            isKey: false
        },
        {
            name: 'assignedTime',
            attrType: TypeRef.NumberType,
            isKey: false
        },
        {
            name: 'vmInSync',
            attrType: TypeRef.BooleanType,
            isKey: false
        }
    ];
    constructor(typeConvert, namePrefix = '', nameSuffix = '') {
        super(typeConvert, namePrefix, nameSuffix);
        // CAUTION: don't forget to set a correct name.
        this.setName('LicenseUsage');
        LicenseUsage.ownStaticAttributes.forEach(def => {
            this.addAttribute(def);
        });
    }
    convertRecord(record: Record): LicenseUsageDbItem {
        const item: LicenseUsageDbItem = {
            checksum: this.typeConvert.valueToString(record.checksum),
            fileName: this.typeConvert.valueToString(record.fileName),
            algorithm: this.typeConvert.valueToString(record.algorithm),
            productName: this.typeConvert.valueToString(record.productName),
            vmId: this.typeConvert.valueToString(record.vmId),
            scalingGroupName: this.typeConvert.valueToString(record.scalingGroupName),
            assignedTime: this.typeConvert.valueToNumber(record.assignedTime),
            vmInSync: this.typeConvert.valueToBoolean(record.vmInSync)
        };
        return item;
    }
}

export interface CustomLogDbItem extends Record {
    id: string;
    timestamp: number;
    logContent: string;
}
export class CustomLog extends Table<CustomLogDbItem> {
    static ownStaticAttributes: Attribute[] = [
        {
            name: 'id',
            attrType: TypeRef.StringType,
            isKey: true,
            keyType: TypeRef.PrimaryKey
        },
        {
            name: 'timestamp',
            attrType: TypeRef.NumberType,
            isKey: true,
            keyType: TypeRef.SecondaryKey
        },
        {
            name: 'logContent',
            attrType: TypeRef.StringType,
            isKey: false
        }
    ];
    constructor(typeConvert, namePrefix = '', nameSuffix = '') {
        super(typeConvert, namePrefix, nameSuffix);
        // CAUTION: don't forget to set a correct name.
        this.setName('CustomLog');
        CustomLog.ownStaticAttributes.forEach(def => {
            this.addAttribute(def);
        });
    }
    convertRecord(record: Record): CustomLogDbItem {
        const item: CustomLogDbItem = {
            id: this.typeConvert.valueToString(record.id),
            timestamp: this.typeConvert.valueToNumber(record.timestamp),
            logContent: this.typeConvert.valueToString(record.logContent)
        };
        return item;
    }
}

export interface VpnAttachmentDbItem extends Record {
    vmId: string;
    ip: string;
    vpnConnectionId: string;
}
export class VpnAttachment extends Table<VpnAttachmentDbItem> {
    static ownStaticAttributes: Attribute[] = [
        {
            name: 'vmId',
            attrType: TypeRef.StringType,
            isKey: true,
            keyType: TypeRef.PrimaryKey
        },
        {
            name: 'ip',
            attrType: TypeRef.StringType,
            isKey: true,
            keyType: TypeRef.SecondaryKey
        },
        {
            name: 'vpnConnectionId',
            attrType: TypeRef.StringType,
            isKey: false
        }
    ];
    constructor(typeConvert, namePrefix = '', nameSuffix = '') {
        super(typeConvert, namePrefix, nameSuffix);
        // CAUTION: don't forget to set a correct name.
        this.setName('VpnAttachment');
        VpnAttachment.ownStaticAttributes.forEach(def => {
            this.addAttribute(def);
        });
    }
    convertRecord(record: Record): VpnAttachmentDbItem {
        const item: VpnAttachmentDbItem = {
            vmId: this.typeConvert.valueToString(record.vmId),
            ip: this.typeConvert.valueToString(record.ip),
            vpnConnectionId: this.typeConvert.valueToString(record.vpnConnectionId)
        };
        return item;
    }
}

export interface ApiRequestCacheDbItem extends Record {
    id: string;
    res: string;
    cacheTime: number;
    ttl: number;
}
export class ApiRequestCache extends Table<ApiRequestCacheDbItem> {
    static ownStaticAttributes: Attribute[] = [
        {
            name: 'id',
            attrType: TypeRef.StringType,
            isKey: true,
            keyType: TypeRef.PrimaryKey
        },
        {
            name: 'res',
            attrType: TypeRef.StringType,
            isKey: false
        },
        {
            name: 'cacheTime',
            attrType: TypeRef.NumberType,
            isKey: false
        },
        {
            name: 'ttl',
            attrType: TypeRef.NumberType,
            isKey: false
        }
    ];
    constructor(typeConvert, namePrefix = '', nameSuffix = '') {
        super(typeConvert, namePrefix, nameSuffix);
        // CAUTION: don't forget to set a correct name.
        this.setName('ApiRequestCache');
        ApiRequestCache.ownStaticAttributes.forEach(def => {
            this.addAttribute(def);
        });
    }
    convertRecord(record: Record): ApiRequestCacheDbItem {
        const item: ApiRequestCacheDbItem = {
            id: this.typeConvert.valueToString(record.id),
            res: this.typeConvert.valueToString(record.res),
            cacheTime: this.typeConvert.valueToNumber(record.cacheTime),
            ttl: this.typeConvert.valueToNumber(record.ttl)
        };
        return item;
    }
}
