import { CosmosClient, Database, FeedResponse, SqlQuerySpec } from '@azure/cosmos';
import {
    AzureSettings,
    AzureSettingsDbItem
} from '@fortinet/fortigate-autoscale/dist/azure/azure-db-definitions';
import chalk from 'chalk';
import * as HttpStatusCodes from 'http-status-codes';
import prompts from 'prompts';

async function getAcknowledgement(): Promise<boolean> {
    console.info(
        chalk.yellow(
            'NOTE: This program will request inputs including database connection key for a ' +
                'one-time use per single run only and will not store your inputs in any way.'
        )
    );
    const res = await prompts({
        type: 'text',
        name: 'acknowledgement',
        message: "type 'yes' to give your acknowledgement and continue."
    });
    return String(res.acknowledgement).toLowerCase() === 'yes';
}

async function createDBConnection(): Promise<Database> {
    const res = await prompts([
        {
            type: 'text',
            name: 'dbAccountName',
            message: "Please input the 'DB Account Name'."
        },
        {
            type: 'text',
            name: 'dbName',
            message: "Please input the 'DB Name'.",
            initial: 'FortiGateAutoscale'
        },
        {
            type: 'password',
            name: 'primaryKey',
            message: "Please input the 'primary key' with read-write permission of the DB Account."
        }
    ]);
    const dbClient = new CosmosClient({
        endpoint: `https://${res.dbAccountName}.documents.azure.com/`,
        key: res.primaryKey
    });
    return dbClient.database(res.dbName);
}

async function loadSettings(db: Database): Promise<AzureSettingsDbItem[]> {
    const table: AzureSettings = new AzureSettings();
    const querySpec: SqlQuerySpec = {
        query: `SELECT * FROM ${table.name} t ORDER BY t.id ASC`
    };

    const feeds: FeedResponse<AzureSettingsDbItem> = await db
        .container(table.name)
        .items.query<AzureSettingsDbItem>(querySpec)
        .fetchAll();
    return feeds.resources;
}

function convert(
    settingsA: AzureSettingsDbItem[],
    settingsB: AzureSettingsDbItem[]
): AzureSettingsDbItem[] {
    const settings: Map<string, AzureSettingsDbItem> = new Map();
    const mapA: Map<string, AzureSettingsDbItem> = new Map();
    const mapB: Map<string, AzureSettingsDbItem> = new Map();
    settingsA.forEach(item => {
        mapA.set(item.settingKey, item);
    });
    settingsB.forEach(item => {
        mapB.set(item.settingKey, item);
    });
    // convert each setting item from the fromSettings
    settingsA.forEach(settingItem => {
        let convertedItem: AzureSettingsDbItem = { ...settingItem };
        switch (settingItem.settingKey) {
            // convert the setting item case by case
            case 'enable-dynamic-nat-gateway':
            case 'fortigate-autoscale-protected-subnet1':
            case 'fortigate-autoscale-protected-subnet2':
            case 'fortigate-autoscale-subnet-1':
            case 'fortigate-autoscale-subnet-2':
            case 'fortigate-default-password':
            case 'fortigate-license-storage-key-prefix':
            case 'get-license-grace-period':
            case 'master-election-no-wait':
            case 'master-scaling-group-name':
            case 'required-configset':
            case 'required-db-table':
                // abandon the above setting
                return;
            case 'deployment-settings-saved':
                convertedItem = { ...mapB.get('fortigate-autoscale-setting-saved') };
                convertedItem.settingValue = settingItem.settingValue;
                break;
            case 'enable-fortigate-elb':
                convertedItem = { ...mapB.get('enable-external-elb') };
                convertedItem.settingValue = settingItem.settingValue;
                break;
            case 'fortigate-autoscale-vpc-id':
                convertedItem = { ...mapB.get('fortigate-autoscale-virtual-network-id') };
                convertedItem.settingValue = settingItem.settingValue;
                break;
            case 'master-election-timeout':
                convertedItem = { ...mapB.get('primary-election-timeout') };
                convertedItem.settingValue = settingItem.settingValue;
                break;
            // copy the setting item from mapB
            default:
                convertedItem = { ...mapB.get(settingItem.settingKey) };
                break;
        }
        if (!convertedItem.settingKey) {
            console.warn('unable to convert item:', chalk.red(JSON.stringify(settingItem)));
        } else {
            settings.set(convertedItem.settingKey, convertedItem);
        }
    });
    // copy each setting item that only exists in the settingsB
    settingsB.forEach(settingItem => {
        if (!settings.has(settingItem.settingKey)) {
            settings.set(settingItem.settingKey, settingItem);
        }
    });
    return Array.from(settings.values());
}

async function saveSetting(
    db: Database,
    setting: AzureSettingsDbItem
): Promise<AzureSettingsDbItem> {
    const table: AzureSettings = new AzureSettings();
    const res = await db.container(table.name).items.upsert(table.downcast(setting));
    if (res.statusCode !== HttpStatusCodes.OK && res.statusCode !== HttpStatusCodes.CREATED) {
        throw new Error(`saveSetting failed with unexpected status code: ${res.statusCode}`);
    }
    return setting;
}

async function clearCache(db: Database): Promise<void> {
    const item = await db.container('ApiRequestCache').item('loadSettings', 'loadSettings');
    let res = await item.read();
    if (res.statusCode === HttpStatusCodes.OK) {
        res = await item.delete();
        console.log(chalk.green('setting cache deleted.'));
    } else if (res.statusCode === HttpStatusCodes.NOT_FOUND) {
        // not found, don't try to delete
        console.log(chalk.yellow('setting cache not found. skipped deleting it.'));
        return;
    }
    if (res.statusCode !== HttpStatusCodes.OK && res.statusCode !== HttpStatusCodes.NO_CONTENT) {
        throw new Error(`clearCache failed with unexpected status code: ${res.statusCode}`);
    }
}

async function saveSettings(db: Database, settings: AzureSettingsDbItem[]): Promise<void> {
    const logs = await Promise.all(
        settings.map(setting => {
            return saveSetting(db, setting)
                .then(res => {
                    return `Setting saved, key: ${chalk.green(res.settingKey)}`;
                })
                .catch(err => {
                    if (err instanceof Error) {
                        return chalk.red(err.message), chalk.red(err.stack);
                    } else {
                        return chalk.red(JSON.stringify(err));
                    }
                });
        })
    );
    logs.sort((a, b) => {
        return a < b ? -1 : 1;
    }).forEach(log => {
        console.info(log);
    });
    // clear cache
    await clearCache(db);
    console.info(chalk.yellow('Completed!'));
}

async function main(): Promise<void> {
    const acknowledged = await getAcknowledgement();
    if (!acknowledged) {
        console.info(chalk.red("Oh! Since you did not type in a 'yes', program ends."));
        return;
    }
    try {
        console.info(`Please provide inputs for connecting to the ${chalk.green('OLD database')}`);
        const dbOld = await createDBConnection();
        console.info(`Please provide inputs for connecting to the ${chalk.green('New database')}`);
        const dbNew = await createDBConnection();
        const settingsOld = await loadSettings(dbOld);
        const settingsNew = await loadSettings(dbNew);
        // NOTE: give a warning if the new DB isn't initialized yet.
        if (settingsNew.length === 0) {
            console.warn(
                `${chalk.yellow(
                    'WARNING: No setting item found in the new database. ' +
                        'You need to follow the provided instructions to complete ' +
                        'the upgrade process.'
                )}`
            );
            throw new Error(
                "The New database doesn't contain setting items. Cannot transfer settings to it."
            );
        }
        const converted = convert(settingsOld, settingsNew);
        await saveSettings(dbNew, converted);
    } catch (error) {
        if (error instanceof Error) {
            console.error(chalk.red(error.stack));
        } else {
            console.error(JSON.stringify(error));
        }
    }
    console.info(chalk.yellow('Program ends.'));
}

main();
