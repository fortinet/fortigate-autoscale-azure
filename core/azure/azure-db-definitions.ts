/* eslint-disable @typescript-eslint/naming-convention */
import * as DBDef from '../db-definitions';

// NOTE: Azure Cosmos DB Data modeling concepts
// see: https://docs.microsoft.com/en-us/azure/cosmos-db/modeling-data
// Cosmos DB is a schema-free type of database so the data type definitions have no effect on
// items.
// The types here are still given just for good readabilty.
export const AzureTypeRefs: DBDef.TypeRefMap = new Map<DBDef.TypeRef, string>([
    [DBDef.TypeRef.StringType, 'string'],
    [DBDef.TypeRef.NumberType, 'number'],
    [DBDef.TypeRef.BooleanType, 'boolean'],
    [DBDef.TypeRef.PrimaryKey, 'hash'],
    [DBDef.TypeRef.SecondaryKey, 'range']
]);

export interface CosmosDBQueryWhereClause {
    name: string;
    value: string;
}

export interface CosmosDBQueryResult<T> {
    result: T[];
    query?: string;
}

// CosmosDB table has some useful meta properties added to each item
// they are defined here below
export interface CosmosDbTableMetaData {
    id: string;
    _rid: string;
    _self: string;
    _etag: string;
    _attachments: string;
    _ts: number;
    [key: string]: string | number | boolean;
}

export const CosmosDbTableMetaDataAttributes = [
    {
        name: 'id',
        attrType: DBDef.TypeRef.StringType,
        isKey: false
    },
    {
        name: '_attachments',
        attrType: DBDef.TypeRef.StringType,
        isKey: false
    },
    {
        name: '_etag',
        attrType: DBDef.TypeRef.StringType,
        isKey: false
    },
    {
        name: '_rid',
        attrType: DBDef.TypeRef.StringType,
        isKey: false
    },
    {
        name: '_self',
        attrType: DBDef.TypeRef.StringType,
        isKey: false
    },
    {
        name: '_ts',
        attrType: DBDef.TypeRef.NumberType,
        isKey: false
    }
];

export class CosmosDBTypeConverter extends DBDef.TypeConverter {
    valueToString(value: unknown): string {
        return value as string;
    }
    valueToNumber(value: unknown): number {
        return Number(value as string);
    }
    valueToBoolean(value: unknown): boolean {
        return !!value;
    }
}

export interface AzureAutoscaleDbItem extends DBDef.AutoscaleDbItem, CosmosDbTableMetaData {}

export class AzureAutoscale
    extends DBDef.Autoscale
    implements DBDef.BidirectionalCastable<DBDef.AutoscaleDbItem, AzureAutoscaleDbItem>
{
    constructor(namePrefix = '', nameSuffix = '') {
        super(new CosmosDBTypeConverter(), namePrefix, nameSuffix);
        // NOTE: use AWS DynamoDB type refs
        this.alterAttributesUsingTypeReference(AzureTypeRefs);
    }
    /**
     * @override override to provide additional meta data
     */
    convertRecord(record: DBDef.Record): AzureAutoscaleDbItem {
        const item: AzureAutoscaleDbItem = {
            ...super.convertRecord(record),
            id: this.typeConvert.valueToString(record.id),
            _attachments: this.typeConvert.valueToString(record._attachments),
            _etag: this.typeConvert.valueToString(record._etag),
            _rid: this.typeConvert.valueToString(record._rid),
            _self: this.typeConvert.valueToString(record._self),
            _ts: this.typeConvert.valueToNumber(record._ts)
        };
        return item;
    }

    downcast(record: DBDef.AutoscaleDbItem): AzureAutoscaleDbItem {
        const item: AzureAutoscaleDbItem = {
            ...record,
            // NOTE: id will be automatically use the primary key value
            // if the record already has property 'id', the following assignmet will overwrite
            // the id value.
            id: String(record[this.primaryKey.name]),
            _attachments: undefined,
            _etag: undefined,
            _rid: undefined,
            _self: undefined,
            _ts: undefined
        };
        return item;
    }

    upcast(record: AzureAutoscaleDbItem): DBDef.AutoscaleDbItem {
        const item: AzureAutoscaleDbItem = {
            ...record
        };
        delete item._attachments;
        delete item._etag;
        delete item._rid;
        delete item._self;
        delete item._ts;
        // delete id only if id is not the primary key
        if (this.primaryKey.name !== 'id') {
            delete item.id;
        }
        return { ...item };
    }
}

export interface AzurePrimaryElectionDbItem
    extends DBDef.PrimaryElectionDbItem,
        CosmosDbTableMetaData {}
export class AzurePrimaryElection
    extends DBDef.PrimaryElection
    implements DBDef.BidirectionalCastable<DBDef.PrimaryElectionDbItem, AzurePrimaryElectionDbItem>
{
    constructor(namePrefix = '', nameSuffix = '') {
        super(new CosmosDBTypeConverter(), namePrefix, nameSuffix);
        // NOTE: use AWS DynamoDB type refs
        this.alterAttributesUsingTypeReference(AzureTypeRefs);
    }

    /**
     * @override override to provide additional meta data
     */
    convertRecord(record: DBDef.Record): AzurePrimaryElectionDbItem {
        const item: AzurePrimaryElectionDbItem = {
            ...super.convertRecord(record),
            _attachments: this.typeConvert.valueToString(record._attachments),
            _etag: this.typeConvert.valueToString(record._etag),
            _rid: this.typeConvert.valueToString(record._rid),
            _self: this.typeConvert.valueToString(record._self),
            _ts: this.typeConvert.valueToNumber(record._ts)
        };
        return item;
    }

    downcast(record: DBDef.PrimaryElectionDbItem): AzurePrimaryElectionDbItem {
        const item: AzurePrimaryElectionDbItem = {
            ...record,
            // NOTE: id will be automatically use the primary key value
            // if the record already has property 'id', the following assignmet will overwrite
            // the id value.
            id: String(record[this.primaryKey.name]),
            _attachments: undefined,
            _etag: undefined,
            _rid: undefined,
            _self: undefined,
            _ts: undefined
        };
        return item;
    }

    upcast(record: AzurePrimaryElectionDbItem): DBDef.PrimaryElectionDbItem {
        const item: AzurePrimaryElectionDbItem = {
            ...record
        };
        delete item._attachments;
        delete item._etag;
        delete item._rid;
        delete item._self;
        delete item._ts;
        // delete id only if id is not the primary key
        if (this.primaryKey.name !== 'id') {
            delete item.id;
        }
        return { ...item };
    }
}

export interface AzureFortiAnalyzerDbItem
    extends DBDef.FortiAnalyzerDbItem,
        CosmosDbTableMetaData {}

export class AzureFortiAnalyzer
    extends DBDef.FortiAnalyzer
    implements DBDef.BidirectionalCastable<DBDef.FortiAnalyzerDbItem, AzureFortiAnalyzerDbItem>
{
    constructor(namePrefix = '', nameSuffix = '') {
        super(new CosmosDBTypeConverter(), namePrefix, nameSuffix);
        // NOTE: use AWS DynamoDB type refs
        this.alterAttributesUsingTypeReference(AzureTypeRefs);
    }

    /**
     * @override override to provide additional meta data
     */
    convertRecord(record: DBDef.Record): AzureFortiAnalyzerDbItem {
        const item: AzureFortiAnalyzerDbItem = {
            ...super.convertRecord(record),
            id: this.typeConvert.valueToString(record.id),
            _attachments: this.typeConvert.valueToString(record._attachments),
            _etag: this.typeConvert.valueToString(record._etag),
            _rid: this.typeConvert.valueToString(record._rid),
            _self: this.typeConvert.valueToString(record._self),
            _ts: this.typeConvert.valueToNumber(record._ts)
        };
        return item;
    }

    downcast(record: DBDef.FortiAnalyzerDbItem): AzureFortiAnalyzerDbItem {
        const item: AzureFortiAnalyzerDbItem = {
            ...record,
            // NOTE: id will be automatically use the primary key value
            // if the record already has property 'id', the following assignmet will overwrite
            // the id value.
            id: String(record[this.primaryKey.name]),
            _attachments: undefined,
            _etag: undefined,
            _rid: undefined,
            _self: undefined,
            _ts: undefined
        };
        return item;
    }

    upcast(record: AzureFortiAnalyzerDbItem): DBDef.FortiAnalyzerDbItem {
        const item: AzureFortiAnalyzerDbItem = {
            ...record
        };
        delete item._attachments;
        delete item._etag;
        delete item._rid;
        delete item._self;
        delete item._ts;
        // delete id only if id is not the primary key
        if (this.primaryKey.name !== 'id') {
            delete item.id;
        }
        return { ...item };
    }
}

export interface AzureSettingsDbItem extends DBDef.SettingsDbItem, CosmosDbTableMetaData {}

export class AzureSettings
    extends DBDef.Settings
    implements DBDef.BidirectionalCastable<DBDef.SettingsDbItem, AzureSettingsDbItem>
{
    constructor(namePrefix = '', nameSuffix = '') {
        super(new CosmosDBTypeConverter(), namePrefix, nameSuffix);
        // NOTE: use AWS DynamoDB type refs
        this.alterAttributesUsingTypeReference(AzureTypeRefs);
    }

    /**
     * @override override to provide additional meta data
     */
    convertRecord(record: DBDef.Record): AzureSettingsDbItem {
        const item: AzureSettingsDbItem = {
            ...super.convertRecord(record),
            id: this.typeConvert.valueToString(record.id),
            _attachments: this.typeConvert.valueToString(record._attachments),
            _etag: this.typeConvert.valueToString(record._etag),
            _rid: this.typeConvert.valueToString(record._rid),
            _self: this.typeConvert.valueToString(record._self),
            _ts: this.typeConvert.valueToNumber(record._ts)
        };
        return item;
    }

    downcast(record: DBDef.SettingsDbItem): AzureSettingsDbItem {
        const item: AzureSettingsDbItem = {
            ...record,
            // NOTE: id will be automatically use the primary key value
            // if the record already has property 'id', the following assignmet will overwrite
            // the id value.
            id: String(record[this.primaryKey.name]),
            _attachments: undefined,
            _etag: undefined,
            _rid: undefined,
            _self: undefined,
            _ts: undefined
        };
        return item;
    }

    upcast(record: AzureSettingsDbItem): DBDef.SettingsDbItem {
        const item: AzureSettingsDbItem = {
            ...record
        };
        delete item._attachments;
        delete item._etag;
        delete item._rid;
        delete item._self;
        delete item._ts;
        // delete id only if id is not the primary key
        if (this.primaryKey.name !== 'id') {
            delete item.id;
        }
        return { ...item };
    }
}

export interface AzureVmInfoCacheDbItem extends DBDef.VmInfoCacheDbItem, CosmosDbTableMetaData {}

export class AzureVmInfoCache
    extends DBDef.VmInfoCache
    implements DBDef.BidirectionalCastable<DBDef.VmInfoCacheDbItem, AzureVmInfoCacheDbItem>
{
    constructor(namePrefix = '', nameSuffix = '') {
        super(new CosmosDBTypeConverter(), namePrefix, nameSuffix);
        // NOTE: use AWS DynamoDB type refs
        this.alterAttributesUsingTypeReference(AzureTypeRefs);
    }
    /**
     * @override override to provide additional meta data
     */
    convertRecord(record: DBDef.Record): AzureVmInfoCacheDbItem {
        const item: AzureVmInfoCacheDbItem = {
            ...super.convertRecord(record),
            _attachments: this.typeConvert.valueToString(record._attachments),
            _etag: this.typeConvert.valueToString(record._etag),
            _rid: this.typeConvert.valueToString(record._rid),
            _self: this.typeConvert.valueToString(record._self),
            _ts: this.typeConvert.valueToNumber(record._ts)
        };
        return item;
    }

    downcast(record: DBDef.VmInfoCacheDbItem): AzureVmInfoCacheDbItem {
        const item: AzureVmInfoCacheDbItem = {
            ...record,
            // NOTE: id will be automatically use the primary key value
            // if the record already has property 'id', the following assignmet will overwrite
            // the id value.
            id: String(record[this.primaryKey.name]),
            _attachments: undefined,
            _etag: undefined,
            _rid: undefined,
            _self: undefined,
            _ts: undefined
        };
        return item;
    }

    upcast(record: AzureVmInfoCacheDbItem): DBDef.VmInfoCacheDbItem {
        const item: AzureVmInfoCacheDbItem = {
            ...record
        };
        delete item._attachments;
        delete item._etag;
        delete item._rid;
        delete item._self;
        delete item._ts;
        // delete id only if id is not the primary key
        if (this.primaryKey.name !== 'id') {
            delete item.id;
        }
        return { ...item };
    }
}

export interface AzureLicenseStockDbItem extends DBDef.LicenseStockDbItem, CosmosDbTableMetaData {}

export class AzureLicenseStock
    extends DBDef.LicenseStock
    implements DBDef.BidirectionalCastable<DBDef.LicenseStockDbItem, AzureLicenseStockDbItem>
{
    constructor(namePrefix = '', nameSuffix = '') {
        super(new CosmosDBTypeConverter(), namePrefix, nameSuffix);
        // NOTE: use AWS DynamoDB type refs
        this.alterAttributesUsingTypeReference(AzureTypeRefs);
    }
    /**
     * @override override to provide additional meta data
     */
    convertRecord(record: DBDef.Record): AzureLicenseStockDbItem {
        const item: AzureLicenseStockDbItem = {
            ...super.convertRecord(record),
            id: this.typeConvert.valueToString(record.id),
            _attachments: this.typeConvert.valueToString(record._attachments),
            _etag: this.typeConvert.valueToString(record._etag),
            _rid: this.typeConvert.valueToString(record._rid),
            _self: this.typeConvert.valueToString(record._self),
            _ts: this.typeConvert.valueToNumber(record._ts)
        };
        return item;
    }

    downcast(record: DBDef.LicenseStockDbItem): AzureLicenseStockDbItem {
        const item: AzureLicenseStockDbItem = {
            ...record,
            // NOTE: id will be automatically use the primary key value
            // if the record already has property 'id', the following assignmet will overwrite
            // the id value.
            id: String(record[this.primaryKey.name]),
            _attachments: undefined,
            _etag: undefined,
            _rid: undefined,
            _self: undefined,
            _ts: undefined
        };
        return item;
    }

    upcast(record: AzureLicenseStockDbItem): DBDef.LicenseStockDbItem {
        const item: AzureLicenseStockDbItem = {
            ...record
        };
        delete item._attachments;
        delete item._etag;
        delete item._rid;
        delete item._self;
        delete item._ts;
        // delete id only if id is not the primary key
        if (this.primaryKey.name !== 'id') {
            delete item.id;
        }
        return { ...item };
    }
}

export interface AzureLicenseUsageDbItem extends DBDef.LicenseUsageDbItem, CosmosDbTableMetaData {}

export class AzureLicenseUsage
    extends DBDef.LicenseUsage
    implements DBDef.BidirectionalCastable<DBDef.LicenseUsageDbItem, AzureLicenseUsageDbItem>
{
    constructor(namePrefix = '', nameSuffix = '') {
        super(new CosmosDBTypeConverter(), namePrefix, nameSuffix);
        // NOTE: use AWS DynamoDB type refs
        this.alterAttributesUsingTypeReference(AzureTypeRefs);
    }
    /**
     * @override override to provide additional meta data
     */
    convertRecord(record: DBDef.Record): AzureLicenseUsageDbItem {
        const item: AzureLicenseUsageDbItem = {
            ...super.convertRecord(record),
            id: this.typeConvert.valueToString(record.id),
            _attachments: this.typeConvert.valueToString(record._attachments),
            _etag: this.typeConvert.valueToString(record._etag),
            _rid: this.typeConvert.valueToString(record._rid),
            _self: this.typeConvert.valueToString(record._self),
            _ts: this.typeConvert.valueToNumber(record._ts)
        };
        return item;
    }

    downcast(record: DBDef.LicenseUsageDbItem): AzureLicenseUsageDbItem {
        const item: AzureLicenseUsageDbItem = {
            ...record,
            // NOTE: id will be automatically use the primary key value
            // if the record already has property 'id', the following assignmet will overwrite
            // the id value.
            id: String(record[this.primaryKey.name]),
            _attachments: undefined,
            _etag: undefined,
            _rid: undefined,
            _self: undefined,
            _ts: undefined
        };
        return item;
    }

    upcast(record: AzureLicenseUsageDbItem): DBDef.LicenseUsageDbItem {
        const item: AzureLicenseUsageDbItem = {
            ...record
        };
        delete item._attachments;
        delete item._etag;
        delete item._rid;
        delete item._self;
        delete item._ts;
        // delete id only if id is not the primary key
        if (this.primaryKey.name !== 'id') {
            delete item.id;
        }
        return { ...item };
    }
}

export interface AzureCustomLogDbItem extends DBDef.CustomLogDbItem, CosmosDbTableMetaData {}

export class AzureCustomLog
    extends DBDef.CustomLog
    implements DBDef.BidirectionalCastable<DBDef.CustomLogDbItem, AzureCustomLogDbItem>
{
    constructor(namePrefix = '', nameSuffix = '') {
        super(new CosmosDBTypeConverter(), namePrefix, nameSuffix);
        // NOTE: use AWS DynamoDB type refs
        this.alterAttributesUsingTypeReference(AzureTypeRefs);
    }
    /**
     * @override override to provide additional meta data
     */
    convertRecord(record: DBDef.Record): AzureCustomLogDbItem {
        const item: AzureCustomLogDbItem = {
            ...super.convertRecord(record),
            _attachments: this.typeConvert.valueToString(record._attachments),
            _etag: this.typeConvert.valueToString(record._etag),
            _rid: this.typeConvert.valueToString(record._rid),
            _self: this.typeConvert.valueToString(record._self),
            _ts: this.typeConvert.valueToNumber(record._ts)
        };
        return item;
    }

    downcast(record: DBDef.CustomLogDbItem): AzureCustomLogDbItem {
        const item: AzureCustomLogDbItem = {
            ...record,
            // NOTE: id will be automatically use the primary key value
            // if the record already has property 'id', the following assignmet will overwrite
            // the id value.
            id: String(record[this.primaryKey.name]),
            _attachments: undefined,
            _etag: undefined,
            _rid: undefined,
            _self: undefined,
            _ts: undefined
        };
        return item;
    }

    upcast(record: AzureCustomLogDbItem): DBDef.CustomLogDbItem {
        const item: AzureCustomLogDbItem = {
            ...record
        };
        delete item._attachments;
        delete item._etag;
        delete item._rid;
        delete item._self;
        delete item._ts;
        // delete id only if id is not the primary key
        if (this.primaryKey.name !== 'id') {
            delete item.id;
        }
        return { ...item };
    }
}

export interface AzureApiRequestCacheDbItem
    extends DBDef.ApiRequestCacheDbItem,
        CosmosDbTableMetaData {}

export class AzureApiRequestCache
    extends DBDef.Table<AzureApiRequestCacheDbItem>
    implements DBDef.BidirectionalCastable<DBDef.ApiRequestCacheDbItem, AzureApiRequestCacheDbItem>
{
    static ownStaticAttributes: DBDef.Attribute[] = [
        ...CosmosDbTableMetaDataAttributes, // NOTE: add addtional Azure CosmosDB table meta data attributes
        // NOTE: use the same attributes of a sibling class, attributes with the same key will
        // those in ...CosmosDbTableMetaDataAttributes
        ...DBDef.ApiRequestCache.ownStaticAttributes
    ];
    private siblingClass: DBDef.ApiRequestCache;
    constructor(namePrefix = '', nameSuffix = '') {
        const converter = new CosmosDBTypeConverter();
        super(converter, namePrefix, nameSuffix);
        // NOTE: set the sibling class reference
        this.siblingClass = new DBDef.ApiRequestCache(converter, namePrefix, nameSuffix);
        // NOTE: use Azure CosmosDB type refs
        this.alterAttributesUsingTypeReference(AzureTypeRefs);
        // CAUTION: don't forget to set a correct name.
        this.setName(this.siblingClass.name);
        // CAUTION: don't forget to add attributes
        AzureApiRequestCache.ownStaticAttributes.forEach(def => {
            this.addAttribute(def);
        });
    }
    /**
     * @override override to provide additional meta data
     */
    convertRecord(record: DBDef.Record): AzureApiRequestCacheDbItem {
        const item: AzureApiRequestCacheDbItem = {
            ...this.siblingClass.convertRecord(record),
            _attachments: this.typeConvert.valueToString(record._attachments),
            _etag: this.typeConvert.valueToString(record._etag),
            _rid: this.typeConvert.valueToString(record._rid),
            _self: this.typeConvert.valueToString(record._self),
            _ts: this.typeConvert.valueToNumber(record._ts)
        };
        // NOTE: the cacheTime property will use the value of _ts
        item.cacheTime = item._ts;
        return item;
    }

    downcast(record: DBDef.ApiRequestCacheDbItem): AzureApiRequestCacheDbItem {
        const item: AzureApiRequestCacheDbItem = {
            ...record,
            // NOTE: id will be automatically use the primary key value
            // if the record already has property 'id', the following assignmet will overwrite
            // the id value.
            id: String(record[this.primaryKey.name]),
            _attachments: undefined,
            _etag: undefined,
            _rid: undefined,
            _self: undefined,
            _ts: undefined
        };
        return item;
    }

    upcast(record: AzureApiRequestCacheDbItem): DBDef.ApiRequestCacheDbItem {
        const item: AzureApiRequestCacheDbItem = {
            ...record
        };
        delete item._attachments;
        delete item._etag;
        delete item._rid;
        delete item._self;
        delete item._ts;
        // delete id only if id is not the primary key
        if (this.primaryKey.name !== 'id') {
            delete item.id;
        }
        return { ...item };
    }
}
