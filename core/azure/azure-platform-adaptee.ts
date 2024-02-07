import { ComputeManagementClient, VirtualMachineScaleSetVM } from '@azure/arm-compute';
import { NetworkInterface, NetworkManagementClient } from '@azure/arm-network';
import {
    CosmosClient,
    CosmosClientOptions,
    Database,
    FeedResponse,
    RequestOptions,
    SqlParameter,
    SqlQuerySpec
} from '@azure/cosmos';
import { ClientSecretCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';
import { BlobServiceClient, StorageSharedKeyCredential } from '@azure/storage-blob';
import * as DBDef from '../db-definitions';
import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import fs from 'fs';
import * as HttpStatusCodes from 'http-status-codes';
import path from 'path';

import {
    AzureApiRequestCache,
    AzureFortiGateAutoscaleSetting,
    AzureSettings,
    AzureSettingsDbItem,
    CosmosDBQueryResult,
    CosmosDBQueryWhereClause,
    CosmosDbTableMetaData
} from '.';
import {
    Blob,
    jsonParseReviver,
    jsonStringifyReplacer,
    PlatformAdaptee,
    SettingItem,
    Settings
} from '..';

// the no-shadow rule errored in the next line may be just a false alarm
// eslint-disable-next-line no-shadow
export enum RequiredEnvVars {
    AUTOSCALE_DB_ACCOUNT = 'AUTOSCALE_DB_ACCOUNT',
    AUTOSCALE_DB_NAME = 'AUTOSCALE_DB_NAME',
    AUTOSCALE_DB_PRIMARY_KEY = 'AUTOSCALE_DB_PRIMARY_KEY',
    AUTOSCALE_KEY_VAULT_NAME = 'AUTOSCALE_KEY_VAULT_NAME',
    AZURE_STORAGE_ACCOUNT = 'AZURE_STORAGE_ACCOUNT',
    AZURE_STORAGE_ACCESS_KEY = 'AZURE_STORAGE_ACCESS_KEY',
    CLIENT_ID = 'CLIENT_ID',
    CLIENT_SECRET = 'CLIENT_SECRET',
    RESOURCE_GROUP = 'RESOURCE_GROUP',
    SUBSCRIPTION_ID = 'SUBSCRIPTION_ID',
    TENANT_ID = 'TENANT_ID'
}

export interface ApiCacheRequest {
    api: string;
    parameters: string[];
    ttl?: number;
}

export interface ApiCacheResult {
    id?: string;
    api?: string;
    parameters?: string[];
    stringifiedData: string;
    ttl: number;
    cacheTime?: number;
    expired?: boolean;
}

export interface ApiCache<T> {
    result: T;
    hitCache: boolean;
    cacheTime: number;
    ttl: number;
}

/**
 * Api Cache options
 * @enum
 */
// the no-shadow rule errored in the next line may be just a false alarm
// eslint-disable-next-line no-shadow
export enum ApiCacheOption {
    /**
     * @member {string} ReadApiFirst always request data from api then save data to cache.
     */
    ReadApiFirst = 'ReadApiFirst',
    /**
     * @member {string} ReadApiOnly always request data from api but never save data to cache.
     */
    ReadApiOnly = 'ReadApiOnly',
    /**
     * @member {string} ReadCacheAndDelete read cache, delete the cache. not request data from api
     */
    ReadCacheAndDelete = 'ReadCacheAndDelete',
    /**
     * @member {string} ReadCacheFirst read cache first. if no cached data, request data from api
     * then save data to cache.
     */
    ReadCacheFirst = 'ReadCacheFirst',
    /**
     * @member {string} ReadCacheOnly only read data from cache. not request data from api
     */
    ReadCacheOnly = 'ReadCacheOnly'
}

const TTLS = {
    listInstances: 600,
    describeInstance: 600,
    listNetworkInterfaces: 600
};

export class AzurePlatformAdaptee implements PlatformAdaptee {
    protected autoscaleDBRef: Database;
    protected azureCompute: ComputeManagementClient;
    protected azureCosmosDB: CosmosClient;
    protected azureKeyVault: SecretClient;
    protected azureNetwork: NetworkManagementClient;
    protected azureStorage: BlobServiceClient;
    protected settings: Settings;
    /**
     * The following process.env are required.
     * process.env.AUTOSCALE_DB_ACCOUNT: the CosmosDB account name
     * process.env.AUTOSCALE_DB_NAME: the Autoscale db name.
     * process.env.CLIENT_ID: the App registration (service principal) app client_id.
     * process.env.CLIENT_SECRET: the App registration (service principal) app client_secret.
     * process.env.TENANT_ID: the tenant containing the App registration (service principal) app.
     */
    constructor() {
        // validation
        const missingEnvVars = Object.keys({ ...RequiredEnvVars }).filter(key => !process.env[key]);
        if (missingEnvVars.length > 0) {
            throw new Error(
                `Missing the following environment variables: ${missingEnvVars.join()}.`
            );
        }
    }
    /**
     * Class instance initiation. The following process.env are required.
     * process.env.AUTOSCALE_DB_ACCOUNT: the CosmosDB account name
     * process.env.AUTOSCALE_DB_NAME: the Autoscale db name.
     * process.env.CLIENT_ID: the App registration (service principal) app client_id.
     * process.env.CLIENT_SECRET: the App registration (service principal) app client_secret.
     * process.env.TENANT_ID: the tenant containing the App registration (service principal) app.
     * @returns {Promise} void
     */
    init(): Promise<void> {
        const cosmosClientOptions: CosmosClientOptions = {
            endpoint: `https://${process.env.AUTOSCALE_DB_ACCOUNT}.documents.azure.com/`,
            key: process.env.AUTOSCALE_DB_PRIMARY_KEY
        };
        this.azureCosmosDB = new CosmosClient(cosmosClientOptions);
        this.autoscaleDBRef = this.azureCosmosDB.database(process.env.AUTOSCALE_DB_NAME);
        // NOTE: migrated from @azure/ms-rest-nodeauth
        // see for example: https://github.com/Azure/ms-rest-nodeauth/blob/master/migrate-to-identity-v2.md#authenticate-with-national-clouds
        const creds = new ClientSecretCredential(
            process.env.TENANT_ID,
            process.env.CLIENT_ID,
            process.env.CLIENT_SECRET
        );
        this.azureCompute = new ComputeManagementClient(creds, process.env.SUBSCRIPTION_ID);
        this.azureNetwork = new NetworkManagementClient(creds, process.env.SUBSCRIPTION_ID);
        this.azureStorage = new BlobServiceClient(
            `https://${process.env.AZURE_STORAGE_ACCOUNT}.blob.core.windows.net`,
            new StorageSharedKeyCredential(
                process.env.AZURE_STORAGE_ACCOUNT,
                process.env.AZURE_STORAGE_ACCESS_KEY
            )
        );
        this.azureKeyVault = new SecretClient(
            `https://${process.env.AUTOSCALE_KEY_VAULT_NAME}.vault.azure.net/`,
            new ClientSecretCredential(
                process.env.TENANT_ID,
                process.env.CLIENT_ID,
                process.env.CLIENT_SECRET
            )
        );
        return Promise.resolve();
    }

    async reloadSettings(invalidateCache: boolean): Promise<Settings> {
        const table = new AzureSettings();
        const queryResult: CosmosDBQueryResult<AzureSettingsDbItem> =
            await this.listItemFromDb<AzureSettingsDbItem>(table);
        const res = queryResult.result || [];
        if (invalidateCache) {
            this.settings = null;
        }
        const records: Map<string, AzureSettingsDbItem> = new Map();
        res.forEach(rec => records.set(rec.settingKey, rec));
        const settings: Settings = new Map<string, SettingItem>();
        Object.values(AzureFortiGateAutoscaleSetting).forEach(value => {
            if (records.has(value)) {
                const record = records.get(value);
                const settingItem = new SettingItem(
                    record.settingKey,
                    record.settingValue,
                    record.description,
                    record.editable,
                    record.jsonEncoded
                );
                settings.set(value, settingItem);
            }
        });
        return settings;
    }

    async loadSettings(): Promise<Settings> {
        if (this.settings) {
            return this.settings;
        }
        const data = await this.reloadSettings(false);
        this.settings = data;
        return this.settings;
    }

    /**
     * get a single item.
     * @param  {Table<T>} table the instance of Table<T> to delete the item.
     * T is the db item type of the given table.
     * @param  {DBDef.KeyValue[]} partitionKeys the partition keys (primary key)
     * of the table
     * @returns {Promise<T>} T
     */
    async getItemFromDb<T>(table: DBDef.Table<T>, partitionKeys: DBDef.KeyValue[]): Promise<T> {
        const primaryKey: DBDef.KeyValue = partitionKeys[0];
        try {
            const itemResponse = await this.autoscaleDBRef
                .container(table.name)
                // CAUTION: the partition key must be provided in order to get the item.
                // the partition key must match the same value of the item in the container.
                .item(primaryKey.value, primaryKey.value)
                .read();
            if (itemResponse.statusCode === HttpStatusCodes.OK) {
                return table.convertRecord({ ...itemResponse.resource });
            } else {
                return null;
            }
        } catch (error) {
            if (error.code === HttpStatusCodes.NOT_FOUND) {
                return null;
            } else {
                throw new DBDef.DbReadError(
                    DBDef.DbErrorCode.UnexpectedResponse,
                    JSON.stringify(error)
                );
            }
        }
    }

    /**
     * Scan and list all or some record from a given db table
     * @param  {Table<T>} table the instance of Table to list the item.
     * @param  {CosmosDBQueryWhereClause[]} listClause (optional) a filter for listing the records
     * @param  {number} limit (optional) number or records to return
     * @returns {Promise} CosmosDBQueryResult object with an array of db record
     * @see https://docs.microsoft.com/en-us/azure/cosmos-db/sql-query-select
     */
    async listItemFromDb<T>(
        table: DBDef.Table<T>,
        listClause?: CosmosDBQueryWhereClause[],
        limit?: number
    ): Promise<CosmosDBQueryResult<T>> {
        let topClause = '';
        if (limit && limit > 0) {
            topClause = ` TOP ${limit}`;
        }
        const querySpec: SqlQuerySpec = {
            query: `SELECT${topClause} * FROM ${table.name} t`
        };
        if (listClause && listClause.length > 0) {
            querySpec.query = `${querySpec.query} WHERE`;
            querySpec.parameters = listClause.map(clause => {
                querySpec.query = `${querySpec.query} t.${clause.name} = @${clause.name} AND`;
                return {
                    name: `@${clause.name}`,
                    value: clause.value
                } as SqlParameter;
            });
            // to remove the last ' AND'
            querySpec.query = querySpec.query.substr(0, querySpec.query.length - 4);
        }
        const queryResult: CosmosDBQueryResult<T> = {
            query: querySpec.query,
            result: null
        };
        const feeds: FeedResponse<T> = await this.autoscaleDBRef
            .container(table.name)
            .items.query<T>(querySpec)
            .fetchAll();
        queryResult.result = feeds.resources;
        return queryResult;
    }
    /**
     * save an item to db. When the optional parameter 'dataIntegrityCheck' is provided, it will
     * perform a data consistency checking before saving.
     * The function compares each property of the item against the existing record
     * with the same primary key in the db table.
     * It saves the item only when one of the following conditions is met:
     * condition 1: if parameter dataIntegrityCheck is passed boolean true, it will
     * only compare the _etag
     * condition 2: if parameter dataIntegrityCheck is passed a check function that accepts
     * an input of type T, it will
     * strictly compare each defined (including null, false and empty value) property
     * @param  {Table<T>} table the instance of Table to save the item.
     * @param  {T} item the item to save
     * @param  {DBDef.SaveCondition} condition save condition
     * @param  {boolean| function} dataIntegrityCheck (optional) ensure data integrity to prevent
     * saving outdated data.
     * @returns {Promise<T>} a promise of item of type T
     */
    async saveItemToDb<T extends CosmosDbTableMetaData>(
        table: DBDef.Table<T>,
        item: T,
        condition: DBDef.SaveCondition,
        dataIntegrityCheck:
            | boolean
            | ((dbItemSnapshot: T) => Promise<{
                  result: boolean;
                  errorMessage: string;
              }>) = true
    ): Promise<T> {
        // CAUTION: validate the db input (non meta data)
        table.validateInput<T>(item);
        // read the item
        const itemSnapshot = await this.getItemFromDb<T>(table, [
            {
                key: table.primaryKey.name,
                value: item.id
            }
        ]);

        let options: RequestOptions;

        // if date with the same primary key already exists in the db table
        if (itemSnapshot) {
            // if a function is provided as dataIntegrityCheck, run the checker function
            if (typeof dataIntegrityCheck === 'function') {
                const checkerResult = await dataIntegrityCheck(itemSnapshot);
                if (!checkerResult.result) {
                    throw new DBDef.DbSaveError(
                        DBDef.DbErrorCode.InconsistentData,
                        `Data integrityCheck failed. ${checkerResult.errorMessage || ''}`
                    );
                }
            }

            // NOTE: if dataIntegrityCheck, enforces this access condition
            options = dataIntegrityCheck && {
                accessCondition: {
                    type: 'IfMatch',
                    condition: itemSnapshot._etag
                }
            };
        }
        // update only but no record found
        if (condition === DBDef.SaveCondition.UpdateOnly && !itemSnapshot) {
            throw new DBDef.DbSaveError(
                DBDef.DbErrorCode.NotFound,
                `Unable to update the item (id: ${item.id}).` +
                    ` The item not exists in the table (name: ${table.name}).`
            );
        }
        // insert only but record found
        else if (condition === DBDef.SaveCondition.InsertOnly && itemSnapshot) {
            throw new DBDef.DbSaveError(
                DBDef.DbErrorCode.KeyConflict,
                `Unable to insert the item (id: ${item.id}).` +
                    ` The item already exists in the table (name: ${table.name}).`
            );
        }
        // TODO: from the logic above, the condition probably be always false
        // can remove this block?
        if (
            dataIntegrityCheck &&
            itemSnapshot &&
            item[table.primaryKey.name] !== itemSnapshot[table.primaryKey.name]
        ) {
            throw new DBDef.DbSaveError(
                DBDef.DbErrorCode.InconsistentData,
                'Inconsistent data.' +
                    ' Primary key values not match.' +
                    'Cannot save item back into db due to' +
                    ' the restriction parameter dataIntegrityCheck is on.'
            );
        }
        // ASSERT: input validation and data consistency checking have passed.
        // db item meta data properties except for the 'id' do not need to be present so they
        // will be removed from the object
        const saveItem = { ...item };
        // CAUTION: id accepts non-empty string value
        // will try to set the id when present in the item,
        // otherwise, will always set id to the same value as primary key
        saveItem.id =
            ((item.id || Number(item.id) === 0) && item.id) || String(item[table.primaryKey.name]);
        delete saveItem._attachments;
        delete saveItem._etag;
        delete saveItem._rid;
        delete saveItem._self;
        delete saveItem._ts;

        // update or insert
        const result = await this.autoscaleDBRef
            .container(table.name)
            .items.upsert(saveItem, options);
        if (
            result.statusCode === HttpStatusCodes.OK ||
            result.statusCode === HttpStatusCodes.CREATED
        ) {
            if (!result.resource) {
                throw new DBDef.DbSaveError(
                    DBDef.DbErrorCode.UnexpectedResponse,
                    "Upsert doesn't return expected data. see the detailed upsert " +
                        `result:${JSON.stringify(result)}`
                );
            }
            return table.convertRecord(result.resource);
        } else {
            throw new DBDef.DbSaveError(
                DBDef.DbErrorCode.UnexpectedResponse,
                'Saving item unsuccessfull. SDK returned unexpected response with ' +
                    ` httpStatusCode: ${result.statusCode}.`
            );
        }
    }
    /**
     * Delete a given item from the db
     * @param  {Table<T>} table the instance of Table to save the item.
     * @param  {T} item the item to be deleted. The primary key must be presented for deletion.
     * @param  {boolean} ensureDataConsistency ensure data consistency to prevent deleting outdated
     * data by doing a full-match of properties of the given item against the item in the db. In
     * this case, each property including meta data will be compared. Otherwise, only the primary
     * key will be used for deletion.
     * @returns {Promise<void>} a promise of void
     */
    async deleteItemFromDb<T extends CosmosDbTableMetaData>(
        table: DBDef.Table<T>,
        item: T,
        ensureDataConsistency = true
    ): Promise<void> {
        let itemSnapshot: T;
        // read the item for comparison if rrequire ensureDataConsistency
        if (ensureDataConsistency) {
            // CAUTION: validate the db input (non meta data)
            table.validateInput<T>(item);
            // read the item
            try {
                itemSnapshot = await this.getItemFromDb(table, [
                    {
                        key: table.primaryKey.name,
                        value: String(item[table.primaryKey.name])
                    }
                ]);
            } catch (error) {
                if (error instanceof DBDef.DbReadError) {
                    throw new DBDef.DbDeleteError(
                        DBDef.DbErrorCode.NotFound,
                        'Cannot delete item. ' +
                            `Item (id: ${item.id}) not found in table (name: ${table.name}).`
                    );
                } else {
                    throw error;
                }
            }
            // NOTE: the itemsnapshot may not exist if already deleted by other
            // db operation.
            if (!itemSnapshot) {
                return;
            }
            // full match
            const keyDiff = Object.keys(itemSnapshot).filter(
                // ensure that item and snapshot both contain the same keys to compare
                key =>
                    item[key] !== undefined &&
                    itemSnapshot[key] !== undefined &&
                    itemSnapshot[key] !== item[key]
            );
            if (keyDiff.length > 0) {
                throw new DBDef.DbDeleteError(
                    DBDef.DbErrorCode.InconsistentData,
                    `Inconsistent data. The attributes don't match: ${keyDiff.join()}. ` +
                        ` Item to delete: ${JSON.stringify(item)}.` +
                        ` Item in the db: ${JSON.stringify(itemSnapshot)}.`
                );
            }
        }
        // CAUTION: validate the db input (only primary key)
        if (item[table.primaryKey.name] === null) {
            throw new DBDef.DbDeleteError(
                DBDef.DbErrorCode.InconsistentData,
                `Required primary key attribute: ${table.primaryKey.name} not` +
                    ` found in item: ${JSON.stringify(item)}`
            );
        }
        // ASSERT: the id and primary key should have the same value
        if (item.id !== item[table.primaryKey.name]) {
            throw new DBDef.DbDeleteError(
                DBDef.DbErrorCode.InconsistentData,
                "Item primary key value and id value don't match. Make sure the id" +
                    ' and primary key have the same value.'
            );
        }
        // ASSERT: the given item matches the item in the db. It can be now deleted.
        const deleteResponse = await this.autoscaleDBRef
            .container(table.name)
            .item(String(item[table.primaryKey.name]), String(item[table.primaryKey.name]))
            .delete();
        if (
            deleteResponse.statusCode === HttpStatusCodes.OK ||
            deleteResponse.statusCode === HttpStatusCodes.NO_CONTENT
        ) {
            return;
        } else if (deleteResponse.statusCode === HttpStatusCodes.NOT_FOUND) {
            throw new DBDef.DbDeleteError(
                DBDef.DbErrorCode.NotFound,
                `Item (${table.primaryKey.name}: ` +
                    `${item.id}) not found in table (${table.name})`
            );
        } else {
            throw new DBDef.DbDeleteError(
                DBDef.DbErrorCode.UnexpectedResponse,
                'Deletion unsuccessful. SDK returned unexpected response with ' +
                    ` httpStatusCode: ${deleteResponse.statusCode}.`
            );
        }
    }
    private generateCacheId(api: string, parameters: string[]): string {
        // NOTE: id is constructed as <api>-[<parameter1-value>-,[<parameter2-value>-...]]
        return [api, ...parameters.map(String)].join('-');
    }
    /**
     * read a cached response of an API request
     * @param  {ApiCacheRequest} req the api request
     * @returns {Promise} ApiRequestSave
     */
    async apiRequestReadCache(req: ApiCacheRequest): Promise<ApiCacheResult> {
        const table = new AzureApiRequestCache();
        try {
            const item = await this.getItemFromDb(table, [
                {
                    key: table.primaryKey.name,
                    value: this.generateCacheId(req.api, req.parameters)
                }
            ]);
            if (item) {
                const timeToLive: number = req.ttl || item.ttl;
                return {
                    id: item.id,
                    stringifiedData: item.res,
                    ttl: item.ttl,
                    cacheTime: item.cacheTime,
                    expired: (item.cacheTime + timeToLive) * 1000 < Date.now()
                };
            }
        } catch (error) {
            if (error instanceof DBDef.DbReadError) {
                if (error.code !== DBDef.DbErrorCode.NotFound) {
                    throw error;
                }
            }
        }
        return null;
    }

    async apiRequestDeleteCache(req: ApiCacheRequest): Promise<void> {
        const table = new AzureApiRequestCache();
        const item = table.downcast({
            id: this.generateCacheId(req.api, req.parameters),
            res: null,
            cacheTime: null,
            ttl: null
        });
        await this.deleteItemFromDb<typeof item>(table, item, false);
    }

    /**
     * save a response of an API request to cache
     * @param  {ApiCacheResult} res the api response
     * @returns {Promise} ApiRequestSave
     */
    async apiRequestSaveCache(res: ApiCacheResult): Promise<ApiCacheResult> {
        // if neither of these conditions is met
        // 1. there is res.id
        // 2. there are res.api and res.parameters
        if (!(res.id || (!res.id && res.api && res.parameters))) {
            throw new Error('Invalid cache result to save. id, api, and paramters are required.');
        }
        const table = new AzureApiRequestCache();
        const item = table.downcast({
            id: res.id || this.generateCacheId(res.api, res.parameters),
            res: res.stringifiedData,
            cacheTime: undefined, // NOTE: cacheTime will use the value of _ts (db generated)
            ttl: res.ttl * 1000
        });
        const savedItem = await this.saveItemToDb<typeof item>(
            table,
            item,
            DBDef.SaveCondition.Upsert,
            false
        );
        if (savedItem) {
            res.cacheTime = savedItem.cacheTime;
        }
        return res;
    }
    /**
     * send an api request with appling a caching strategy.
     * This can prevent from firing too many arm resource requests to Microsoft Azure that
     * results in throttling resource manager request.
     * @see https://docs.microsoft.com/en-us/azure/azure-resource-manager/management/request-limits-and-throttling
     * @param  {ApiCacheRequest} req an api cache request
     * @param  {ApiCacheOption} cacheOption option for the api caching behavior.
     * @param  {function} dataProcessor a method that process the api request and return
     * a promise of type D
     * @returns {Promise} an ApiCache of type D
     */
    private async requestWithCaching<D>(
        req: ApiCacheRequest,
        cacheOption: ApiCacheOption,
        dataProcessor: () => Promise<D>
    ): Promise<ApiCache<D>> {
        const ttl = 600;
        let cacheTime: number;
        let res: ApiCacheResult;
        let data: D;

        // read cache for those options require reading cache
        if (cacheOption !== ApiCacheOption.ReadApiOnly) {
            res = await this.apiRequestReadCache(req);
            cacheTime = res && res.cacheTime;
            data = (res && (JSON.parse(res.stringifiedData, jsonParseReviver) as D)) || null;
        }

        const hitCache = res && res.expired === false;

        // for those options do not require reading data from api
        if (
            cacheOption === ApiCacheOption.ReadCacheOnly ||
            cacheOption === ApiCacheOption.ReadCacheAndDelete
        ) {
            // delete the cache if exists
            if (cacheOption === ApiCacheOption.ReadCacheAndDelete && res) {
                await this.apiRequestDeleteCache(req);
                cacheTime = 0;
            }
        }
        // for those options require reading data from api
        else {
            if (
                // read cache first then read api when cache not found
                (cacheOption === ApiCacheOption.ReadCacheFirst && !res) ||
                // read data from api only, will not cache the result
                cacheOption === ApiCacheOption.ReadApiOnly ||
                // read data from api and then update the cache
                cacheOption === ApiCacheOption.ReadApiFirst
            ) {
                // read data from api
                data = await dataProcessor();
                if (data) {
                    // if it requires to save cache, save cache.
                    if (cacheOption !== ApiCacheOption.ReadApiOnly) {
                        if (!res) {
                            res = {
                                stringifiedData: '',
                                ttl: 0
                            };
                        }
                        res.api = req.api;
                        res.parameters = req.parameters;
                        res.stringifiedData = JSON.stringify(data, jsonStringifyReplacer);
                        res.ttl = req.ttl;
                        res = await this.apiRequestSaveCache(res);
                        cacheTime = res.cacheTime;
                    }
                }
            }
        }
        return {
            result: data,
            cacheTime: cacheTime,
            ttl: ttl,
            hitCache: hitCache
        };
    }

    /**
     * list vm instances in the given scaling group (vmss)
     * @param  {string} scalingGroupName the scaling group containing the vm
     * @param  {ApiCacheOption} cacheOption (optional) option for the api caching behavior.
     * default to ApiCacheOption.ReadCacheFirst
     * @returns {Promise} a list of VirtualMachineScaleSetVM objects
     */
    async listInstances(
        scalingGroupName: string,
        cacheOption: ApiCacheOption = ApiCacheOption.ReadCacheFirst
    ): Promise<ApiCache<VirtualMachineScaleSetVM[]>> {
        const req: ApiCacheRequest = {
            api: 'listInstances',
            parameters: [scalingGroupName],
            ttl: TTLS.listInstances // expected time to live
        };

        const requestProcessor = async (): Promise<VirtualMachineScaleSetVM[]> => {
            const response = await this.azureCompute.virtualMachineScaleSetVMs.list(
                process.env[RequiredEnvVars.RESOURCE_GROUP],
                scalingGroupName
            );
            const list: VirtualMachineScaleSetVM[] = [];
            let result: IteratorResult<VirtualMachineScaleSetVM, VirtualMachineScaleSetVM[]>;
            if (response) {
                do {
                    result = await response.next();
                    const value = result.value;
                    if (Array.isArray(value)) {
                        value.forEach(vm => {
                            list.push(vm);
                        });
                    } else {
                        list.push(value);
                    }
                } while (!result.done);
            }
            return list.length > 0 ? list : null;
        };
        return await this.requestWithCaching<VirtualMachineScaleSetVM[]>(
            req,
            cacheOption,
            requestProcessor
        );
    }
    /**
     * describe a virtual machine
     * @param  {string} scalingGroupName the scaling group containing the vm
     * @param  {string} id the id (either integer instanceId or string vmId) of the vm
     * @param  {ApiCacheOption} cacheOption (optional) option for the api caching behavior.
     * default to ApiCacheOption.ReadCacheFirst
     * @returns {Promise} ApiCache<VirtualMachineScaleSetVM>
     */
    async describeInstance(
        scalingGroupName: string,
        id: string,
        cacheOption: ApiCacheOption = ApiCacheOption.ReadCacheFirst
    ): Promise<ApiCache<VirtualMachineScaleSetVM>> {
        let data: VirtualMachineScaleSetVM;
        let instanceId: string = id;
        // ASSERT: id is the vmId to be looked up
        // NOTE: need to find the corresponding vm.instanceId using vm.vmId by listing all
        // instances in the vmss and find the vm.
        if (!isFinite(Number(id))) {
            let listResult = await this.listInstances(scalingGroupName, cacheOption);
            data = listResult.result.find(v => v.vmId && v.vmId === id);
            // NOTE: if vm is a new vm, it won't exist in the cache so try to read from api again
            // then update cache, just once.
            if (!data) {
                listResult = await this.listInstances(
                    scalingGroupName,
                    ApiCacheOption.ReadApiFirst
                );
                data = listResult.result.find(v => v.vmId && v.vmId === id);
            }
            if (data) {
                instanceId = data.instanceId;
            } else {
                // vm not exists.
                return {
                    result: null,
                    hitCache: listResult.hitCache,
                    cacheTime: listResult.cacheTime,
                    ttl: listResult.ttl
                };
            }
        }
        const req: ApiCacheRequest = {
            api: 'describeInstance',
            parameters: [scalingGroupName, id],
            ttl: TTLS.describeInstance // expected time to live
        };
        const requestProcessor = async (): Promise<typeof data> => {
            const response = await this.azureCompute.virtualMachineScaleSetVMs.get(
                process.env[RequiredEnvVars.RESOURCE_GROUP],
                scalingGroupName,
                instanceId,
                {
                    expand: 'instanceView'
                }
            );
            return response;
        };
        return await this.requestWithCaching<typeof data>(req, cacheOption, requestProcessor);
    }
    /**
     * Delete an instance from a scaling group (vmss)
     * @param  {string} scalingGroupName the scaling group containing the vm
     * @param  {number} instanceId the integer instanceId of the vm
     * @returns {Promise} boolean whether the instance existed and deleted or not exist to delete
     */
    async deleteInstanceFromVmss(scalingGroupName: string, instanceId: number): Promise<boolean> {
        // CAUTION: when delete instance, must handle cache, otherwise, it can result in
        // cached data inconsistent.
        // possibly every method that involves caching should be handled to to delete cache
        // aka: where requestWithCaching() is applied.

        // providing ApiCacheOption.ReadCacheAndDelete will ensure cache is deleted after read
        await Promise.all([
            this.listInstances(scalingGroupName, ApiCacheOption.ReadCacheAndDelete),
            this.describeInstance(
                scalingGroupName,
                String(instanceId),
                ApiCacheOption.ReadCacheAndDelete
            ),
            this.listNetworkInterfaces(
                scalingGroupName,
                instanceId,
                ApiCacheOption.ReadCacheAndDelete
            )
        ]);

        // ASSERT: all related caches are deleted. can delete the vm now
        try {
            const op = await this.azureCompute.virtualMachineScaleSetVMs.beginDelete(
                process.env[RequiredEnvVars.RESOURCE_GROUP],
                scalingGroupName,
                String(instanceId)
            );
            await op.pollUntilDone();
            return true;
        } catch (error) {
            throw new Error(`Error in deleting a VM from VMSS: ${error}`);
        }
    }
    /**
     * list network interfaces of a vm in the scaling group (vmss)
     * @param  {string} scalingGroupName the scaling group containing the vm
     * @param  {number} id the integer instanceId of the vm
     * @param  {ApiCacheOption} cacheOption (optional) option for the api caching behavior.
     * default to ApiCacheOption.ReadCacheFirst
     * @param  {number} ttl (optional) cache time to live in seconds. default to 600
     * @returns {Promise} ApiCache<NetworkInterface[]>
     */
    async listNetworkInterfaces(
        scalingGroupName: string,
        id: number,
        cacheOption: ApiCacheOption = ApiCacheOption.ReadCacheFirst,
        ttl = TTLS.listNetworkInterfaces
    ): Promise<ApiCache<NetworkInterface[]>> {
        const req: ApiCacheRequest = {
            api: 'listNetworkInterfaces',
            parameters: [scalingGroupName, String(id)],
            ttl: ttl // expected time to live
        };
        const requestProcessor = async (): Promise<NetworkInterface[]> => {
            const response =
                await this.azureNetwork.networkInterfaces.listVirtualMachineScaleSetVMNetworkInterfaces(
                    process.env[RequiredEnvVars.RESOURCE_GROUP],
                    scalingGroupName,
                    String(id)
                );
            const list: NetworkInterface[] = [];
            let result: IteratorResult<NetworkInterface, NetworkInterface[]>;
            if (response) {
                do {
                    result = await response.next();
                    const value = result.value;
                    if (Array.isArray(value)) {
                        value.forEach(vm => {
                            list.push(vm);
                        });
                    } else {
                        list.push(value);
                    }
                } while (!result.done);
            }
            return list.length > 0 ? list : null;
        };
        return await this.requestWithCaching<NetworkInterface[]>(
            req,
            cacheOption,
            requestProcessor
        );
    }

    private streamToBuffer(readableStream: NodeJS.ReadableStream): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            const chunks = [];
            readableStream.on('data', data => {
                chunks.push(data instanceof Buffer ? data : Buffer.from(data));
            });
            readableStream.on('end', () => {
                resolve(Buffer.concat(chunks));
            });
            readableStream.on('error', reject);
        });
    }
    /**
     * read the content of a blob into a string
     * @param  {string} container the blob container containing the target blob file
     * @param  {string} blobFilePath the full path to the blob file in the container, including
     * blob file name
     * @returns {Promise} string
     */
    async getBlobContent(container: string, blobFilePath: string): Promise<string> {
        const containerClient = this.azureStorage.getContainerClient(container);
        if (!containerClient.exists()) {
            throw new Error(`blob container (name: ${container}) not exists.`);
        }
        const blobClient = containerClient.getBlobClient(blobFilePath);
        if (!blobClient.exists()) {
            throw new Error(`blob container (name: ${container}) not exists.`);
        }
        // download the blob from position 0 (beginning)
        const response = await blobClient.download();
        const buffer = await this.streamToBuffer(response.readableStreamBody);
        return buffer.toString();
    }
    /**
     * List all blob objects in a given container
     * @param  {string} container the blob container containing the target blob file
     * @param  {string} subdirectory the subdirectory of the container to list
     * @returns {Promise} an array of blob objects in the given location
     */
    async listBlob(container: string, subdirectory?: string): Promise<Blob[]> {
        const prefix = subdirectory || '';

        // DEBUG: for local debugging use, the next lines get files from local file system instead
        // it is usually useful when doing a mock test that do not require real api calls
        if (process.env.LOCAL_DEV_MODE === 'true') {
            return fs
                .readdirSync(path.resolve(container, prefix))
                .filter(fileName => {
                    const stat = fs.statSync(path.resolve(container, prefix, fileName));
                    return !stat.isDirectory();
                })
                .map(fileName => {
                    return {
                        fileName: fileName,
                        content: ''
                    } as Blob;
                });
        } else {
            const containerClient = this.azureStorage.getContainerClient(container);
            if (!containerClient.exists()) {
                throw new Error(`blob container (name: ${container}) not exists.`);
            }
            const iterator = containerClient.listBlobsFlat();
            const blobs: Blob[] = [];
            let result = await iterator.next();
            while (!result.done) {
                blobs.push({
                    fileName: path.basename(result.value.name),
                    filePath: path.dirname(result.value.name)
                });
                result = await iterator.next();
            }
            return blobs.filter(blob => blob.filePath === subdirectory);
        }
    }

    /**
     * invoke another Azure function
     * @param  {string} functionEndpoint the full function URL, format:
     * https://<APP_NAME>.azurewebsites.net/api/<FUNCTION_NAME>
     * @param  {string} payload a JSON stringified JSON object that can be parsed back to a JSON
     * object without error.
     * @param  {string} accessKey? (optional) function authentication keys
     * @returns {Promise} a JSON stringified response of the invoked function
     * @see https://docs.microsoft.com/en-us/azure/azure-functions/functions-bindings-http-webhook-trigger?tabs=csharp#authorization-keys
     * @see https://docs.microsoft.com/en-us/azure/azure-functions/durable/durable-functions-overview
     */
    async invokeAzureFunction(
        functionEndpoint: string,
        payload: string,
        accessKey?: string
    ): Promise<AxiosResponse<string>> {
        // NOTE: make requests to another Azure function using http requests and  library axios
        const reqOptions: AxiosRequestConfig = {
            method: 'POST',
            headers: {
                'x-functions-key': accessKey
            },
            url: functionEndpoint,
            data: JSON.parse(payload),
            // NOTE: see the hard timeout
            // https://docs.microsoft.com/en-us/azure/azure-functions/functions-scale#timeout
            timeout: 230000 // ms
        };
        return await axios(reqOptions);
    }

    async keyVaultGetSecret(key: string): Promise<string> {
        const secret = await this.azureKeyVault.getSecret(key);
        return secret.value;
    }
}
