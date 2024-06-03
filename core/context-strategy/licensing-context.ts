import path from 'path';
import { CloudFunctionProxyAdapter } from '../cloud-function-proxy';
import { waitFor, WaitForConditionChecker, WaitForPromiseEmitter } from '../helper-function';
import {
    LicenseFile,
    LicenseStockRecord,
    LicenseUsageRecord,
    PlatformAdapter
} from '../platform-adapter';
import { VirtualMachine, VirtualMachineState } from '../virtual-machine';

// the no-shadow rule errored in the next line may be just a false alarm
// eslint-disable-next-line no-shadow
export enum LicensingStrategyResult {
    LicenseAssigned = 'license-assigned',
    LicenseOutOfStock = 'license-out-of-stock',
    LicenseNotRequired = 'license-not-required'
}

export interface LicensingStrategy {
    prepare(
        vm: VirtualMachine,
        productName: string,
        storageContainerName: string,
        licenseDirectoryName: string
    ): Promise<void>;
    apply(): Promise<LicensingStrategyResult>;
    getLicenseContent(): Promise<string>;
}

/**
 * To provide Licensing model related logics such as license assignment.
 */
// the no-shadow rule errored in the next line may be just a false alarm
// eslint-disable-next-line no-shadow
export interface LicensingModelContext {
    setLicensingStrategy(strategy: LicensingStrategy): void;
    handleLicenseAssignment(productName: string): Promise<string>;
}

export class NoopLicensingStrategy implements LicensingStrategy {
    platform: PlatformAdapter;
    proxy: CloudFunctionProxyAdapter;
    vm: VirtualMachine;
    storageContainerName: string;
    licenseDirectoryName: string;
    constructor(platform: PlatformAdapter, proxy: CloudFunctionProxyAdapter) {
        this.platform = platform;
        this.proxy = proxy;
    }
    prepare(
        vm: VirtualMachine,
        storageContainerName: string,
        licenseDirectoryName: string
    ): Promise<void> {
        this.vm = vm;
        this.storageContainerName = storageContainerName;
        this.licenseDirectoryName = licenseDirectoryName;
        return Promise.resolve();
    }
    apply(): Promise<LicensingStrategyResult> {
        this.proxy.logAsInfo('calling NoopLicensingStrategy.apply');
        this.proxy.logAsInfo('noop');
        this.proxy.logAsInfo('called NoopLicensingStrategy.apply');
        return Promise.resolve(LicensingStrategyResult.LicenseNotRequired);
    }
    getLicenseContent(): Promise<string> {
        return Promise.resolve('');
    }
}

export class ReusableLicensingStrategy implements LicensingStrategy {
    platform: PlatformAdapter;
    proxy: CloudFunctionProxyAdapter;
    vm: VirtualMachine;
    storageContainerName: string;
    licenseDirectoryName: string;
    licenseFiles: LicenseFile[];
    stockRecords: LicenseStockRecord[];
    usageRecords: LicenseUsageRecord[];
    licenseRecord: LicenseStockRecord | null;
    private licenseFile: LicenseFile;
    productName: string;
    constructor(platform: PlatformAdapter, proxy: CloudFunctionProxyAdapter) {
        this.platform = platform;
        this.proxy = proxy;
    }
    prepare(
        vm: VirtualMachine,
        productName: string,
        storageContainerName: string,
        licenseDirectoryName: string
    ): Promise<void> {
        this.vm = vm;
        this.productName = productName;
        this.storageContainerName = storageContainerName;
        this.licenseDirectoryName = licenseDirectoryName;
        this.licenseFiles = [];
        this.stockRecords = [];
        this.usageRecords = [];
        return Promise.resolve();
    }
    async apply(): Promise<LicensingStrategyResult> {
        this.proxy.logAsInfo('calling ReusableLicensingStrategy.apply');
        [this.licenseFiles, this.stockRecords, this.usageRecords] = await Promise.all([
            this.platform
                .listLicenseFiles(this.storageContainerName, this.licenseDirectoryName)
                .catch(err => {
                    this.proxy.logForError('failed to list license blob files.', err);
                    return [];
                }),
            this.platform.listLicenseStock(this.productName).catch(err => {
                this.proxy.logForError('failed to list license stock', err);
                return null;
            }),
            this.platform.listLicenseUsage(this.productName).catch(err => {
                this.proxy.logForError('failed to list license stock', err);
                return null;
            })
        ]);
        // update the license stock records on db if any change in file storage
        // this returns the newest stockRecords on the db
        await this.updateLicenseStockRecord(this.licenseFiles);
        this.stockRecords = await this.platform.listLicenseStock(this.productName);

        // is the license in use by the same vm?
        [this.licenseRecord] = Array.from(this.usageRecords.values()).filter(record => {
            return record.vmId === this.vm.id;
        }) || [null];

        // if the usage record array contains a license that is physically deleted,
        // should remove such record from the usage record array so that the license files used
        // in the usage records are always valid.
        const stockLicenseChecksum = this.stockRecords.map(stock => stock.checksum);
        this.usageRecords = this.usageRecords.filter(usage =>
            stockLicenseChecksum.includes(usage.checksum)
        );

        try {
            // get an available license
            if (this.licenseFiles.length > 0 && !this.licenseRecord) {
                this.licenseRecord = await this.getAvailableLicense();
            }
            if (!this.licenseRecord) {
                this.proxy.logAsWarning('No license available.');
                this.proxy.logAsInfo('called ReusableLicensingStrategy.apply');
                return LicensingStrategyResult.LicenseOutOfStock;
            }

            // load license content
            const filePath = path.posix.join(
                this.licenseDirectoryName,
                this.licenseRecord.fileName
            );
            this.proxy.logAsDebug(
                'load blob in blob container',
                `name: [${this.storageContainerName}], path:` + `[${filePath}]`
            );
            const content = await this.platform.loadLicenseFileContent(
                this.storageContainerName,
                filePath
            );
            this.licenseFile = {
                fileName: this.licenseRecord.fileName,
                checksum: this.licenseRecord.checksum,
                algorithm: this.licenseRecord.algorithm,
                content: content
            };
            this.proxy.logAsInfo(
                `license file (name: ${this.licenseFile.fileName},` +
                    ` checksum: ${this.licenseFile.checksum}) is loaded.`
            );
        } catch (error) {
            this.proxy.logForError('Failed to get a license.', error);
            this.proxy.logAsInfo('called ReusableLicensingStrategy.apply');
            return LicensingStrategyResult.LicenseOutOfStock;
        }

        this.proxy.logAsInfo('called ReusableLicensingStrategy.apply');
        return LicensingStrategyResult.LicenseAssigned;
    }
    async updateLicenseStockRecord(licenseFiles: LicenseFile[]): Promise<void> {
        const stockArray =
            (licenseFiles &&
                licenseFiles.map(f => {
                    return {
                        fileName: f.fileName,
                        checksum: f.checksum,
                        algorithm: f.algorithm,
                        productName: this.productName
                    } as LicenseStockRecord;
                })) ||
            [];
        await this.platform.updateLicenseStock(stockArray);
    }

    /**
     * sync the vm in-sync status from the scaling group to the usage record
     *
     * @protected
     * @param {LicenseUsageRecord[]} usageRecords array of license usage record
     * @returns {Promise<void>} void
     */
    protected async syncVmStatusToUsageRecords(usageRecords: LicenseUsageRecord[]): Promise<void> {
        const updatedRecordArray = await Promise.all(
            usageRecords.map(async u => {
                const vm = await this.platform.getVmById(u.vmId, u.scalingGroupName);
                const item: LicenseUsageRecord = { ...u };
                item.vmInSync = !!(vm && vm.state === VirtualMachineState.Running);
                return { item: item, reference: u };
            })
        );
        await this.platform.updateLicenseUsage(updatedRecordArray);
    }

    protected async useLicense(record: LicenseUsageRecord, vm: VirtualMachine): Promise<boolean> {
        try {
            const newRecord: LicenseUsageRecord = { ...record };
            newRecord.scalingGroupName = vm.scalingGroupName;
            newRecord.vmId = vm.id;
            newRecord.assignedTime = Date.now();
            // ASSERT: vm is in sync.
            newRecord.vmInSync = true;
            await this.platform.updateLicenseUsage([
                { item: newRecord, reference: record.vmId ? record : null }
            ]);
            // refresh the usage record because it is updated.
            this.usageRecords = await this.platform.listLicenseUsage(this.productName);
            return true;
        } catch (error) {
            return false;
        }
    }

    protected async listOutOfSyncRecord(sync?: boolean): Promise<LicenseUsageRecord[]> {
        let outOfSyncArray: LicenseUsageRecord[];
        if (sync) {
            await this.syncVmStatusToUsageRecords(this.usageRecords).catch(() => {
                this.proxy.logAsWarning(
                    'Ignore errors when sync VM status to license usage records.'
                );
            });
            this.usageRecords = Array.from(
                (await this.platform.listLicenseUsage(this.productName)).values()
            );
            return Array.from(this.usageRecords.values()).filter(usageRecrod => {
                return !usageRecrod.vmInSync;
            });
        } else {
            outOfSyncArray = Array.from(this.usageRecords.values()).filter(usageRecrod => {
                return !usageRecrod.vmInSync;
            });
            // if every license is in use and seems to be in-sync,
            // sync the record with vm running state and heartbeat records,
            // then check it once again
            if (outOfSyncArray.length === 0) {
                return await this.listOutOfSyncRecord(true);
            }
            return outOfSyncArray;
        }
    }

    protected async getAvailableLicense(): Promise<LicenseStockRecord> {
        let outOfSyncArray: LicenseUsageRecord[];
        // try to look for an unused one first
        // checksum is the unique key of a license
        const usageMap: Map<string, LicenseStockRecord> = new Map(
            this.usageRecords.map(u => [u.checksum, u])
        );
        const unusedArray = this.stockRecords.filter(
            stockRecord => !usageMap.has(stockRecord.checksum)
        );
        let licenseStockRecord: LicenseStockRecord;
        if (unusedArray.length > 0) {
            // pick the first one, lock the license in order to prevent it from being picked at the
            // same time, and return as unused license
            let index = 0;
            const unusedLicenseEmitter: WaitForPromiseEmitter<LicenseStockRecord> = async () => {
                const usageRecord: LicenseUsageRecord = {
                    fileName: unusedArray[index].fileName,
                    checksum: unusedArray[index].checksum,
                    algorithm: unusedArray[index].algorithm,
                    productName: unusedArray[index].productName,
                    vmId: undefined,
                    scalingGroupName: undefined,
                    assignedTime: undefined,
                    vmInSync: true
                };
                const result = await this.useLicense(usageRecord, this.vm);
                return result && unusedArray[index];
            };

            const unusedLicenseChecker: WaitForConditionChecker<LicenseStockRecord> = rec => {
                if (rec) {
                    return Promise.resolve(true);
                } else if (index < unusedArray.length - 1) {
                    index++;
                    return Promise.resolve(false);
                } else {
                    throw new Error(
                        `None of the unused licenses (total: ${unusedArray.length})` +
                            'can be used at this moment. Probably they have been assigned already.'
                    );
                }
            };

            try {
                licenseStockRecord = await waitFor<LicenseStockRecord>(
                    unusedLicenseEmitter,
                    unusedLicenseChecker,
                    5000,
                    this.proxy
                );
            } catch (error) {
                this.proxy.logForError('Error in allocating an unused license.', error);
            }
        }

        // a valid license is allocated. return the license record
        if (licenseStockRecord) {
            this.proxy.logAsInfo(
                `An unused license (checksum: ${licenseStockRecord.checksum}, ` +
                    `file name: ${licenseStockRecord.fileName}) is found.`
            );
            return licenseStockRecord;
        }
        // if no availalbe unused license, check if any in-use license is associated
        // with a vm which isn't in-sync
        else {
            // pick the first one and return as a reusable license
            // in order to avoid race conditions,
            // set a loop to pick the next available license by updating the usage record
            // if sucessfully updated one record, that record can then be used.
            let maxTries = 0;
            const usedLicenseEmitter: WaitForPromiseEmitter<LicenseUsageRecord> = async () => {
                outOfSyncArray = await this.listOutOfSyncRecord();
                // determine the maximum number of tries before giving up
                maxTries = Math.max(maxTries, outOfSyncArray.length);
                return (
                    (outOfSyncArray.length > 0 &&
                        (await this.useLicense(outOfSyncArray[0], this.vm)) &&
                        outOfSyncArray[0]) ||
                    null
                );
            };
            const usedLicenseChecker: WaitForConditionChecker<LicenseUsageRecord> = (
                rec,
                callCount
            ) => {
                if (rec) {
                    return Promise.resolve(true);
                } else if (outOfSyncArray.length === 0) {
                    throw new Error('Run out of license.');
                } else if (callCount >= maxTries) {
                    throw new Error(`maximum amount of attempts ${maxTries} have been reached.`);
                } else {
                    return Promise.resolve(false);
                }
            };
            const licenseRecord = await waitFor<LicenseUsageRecord>(
                usedLicenseEmitter,
                usedLicenseChecker,
                5000,
                this.proxy
            );

            this.proxy.logAsInfo(
                `A reusable license (checksum: ${licenseRecord.checksum},` +
                    ` previous assigned vmId: ${licenseRecord.vmId},` +
                    ` file name: ${licenseRecord.fileName}) is found.`
            );
            return licenseRecord;
        }
    }
    getLicenseContent(): Promise<string> {
        return Promise.resolve(this.licenseFile.content);
    }
}
