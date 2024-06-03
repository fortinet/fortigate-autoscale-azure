import {
    AutoscaleEnvironment,
    Blob,
    BootstrapConfigStrategyResult,
    BootstrapConfigurationStrategy,
    CloudFunctionProxyAdapter,
    configSetResourceFinder,
    PlatformAdapter,
    Settings,
    VirtualMachine
} from '..';
import { FortiGateAutoscaleSetting } from '.';

export abstract class FortiGateBootstrapConfigStrategy implements BootstrapConfigurationStrategy {
    static SUCCESS = 'SUCCESS';
    static FAILED = 'FAILED';
    private config: string;
    protected settings: Settings;
    protected alreadyLoaded = [];
    abstract get platform(): PlatformAdapter;
    abstract set platform(p: PlatformAdapter);
    abstract get proxy(): CloudFunctionProxyAdapter;
    abstract set proxy(x: CloudFunctionProxyAdapter);
    abstract get env(): AutoscaleEnvironment;
    abstract set env(e: AutoscaleEnvironment);
    /**
     * get the bootstrap configuration for a certain role determined by the apply()
     * @returns {string} configuration
     */
    getConfiguration(): string {
        return this.config;
    }
    /**
     * apply the strategy with parameter provided via prepare()
     * @returns {Promise} BootstrapConfigStrategyResult
     */
    async apply(): Promise<BootstrapConfigStrategyResult> {
        this.settings = await this.platform.getSettings();
        const config = await this.loadConfig();
        // target is the primary? return config sets for active role
        if (this.platform.vmEquals(this.env.targetVm, this.env.primaryVm)) {
            this.config = await this.getPrimaryRoleConfig(config, this.env.targetVm);
            this.proxy.logAsInfo('loaded configuration for primary role.');
        }
        // else return config sets for passive device role
        else {
            this.config = await this.getSecondaryRoleConfig(
                config,
                this.env.targetVm,
                this.env.primaryVm
            );
            this.proxy.logAsInfo('loaded configuration for secondary role.');
        }
        return BootstrapConfigStrategyResult.SUCCESS;
    }
    /**
     * load the base configset content
     * @returns {Promise} configset content
     */
    protected async loadBase(): Promise<string> {
        try {
            const config = await this.platform.loadConfigSet('baseconfig');
            this.alreadyLoaded.push('baseconfig');
            return config;
        } catch (error) {
            this.proxy.logForError(
                "[baseconfig] configset doesn't exist in the assets storage. " +
                    'Configset Not loaded.',
                error
            );
            throw new Error('baseconfig is required but not found.');
        }
    }
    /**
     * load the configset content for setting up the secondary nic
     * @returns {Promise} configset content
     */
    protected async loadPort2(): Promise<string> {
        try {
            const config = await this.platform.loadConfigSet('port2config');
            this.alreadyLoaded.push('port2config');
            return config;
        } catch (error) {
            this.proxy.logForError(
                "[port2config] configset doesn't exist in the assets storage. " +
                    'Configset Not loaded.',
                error
            );
            return '';
        }
    }
    /**
     * load the configset content for setting up an internal elb for web service cluster
     * @returns {Promise} configset content
     */
    protected async loadInternalElbWeb(): Promise<string> {
        try {
            const config = await this.platform.loadConfigSet('internalelbwebserv');
            this.alreadyLoaded.push('internalelbwebserv');
            return config;
        } catch (error) {
            this.proxy.logAsWarning(
                "[internalelbwebserv] configset doesn't exist in the assets storage. " +
                    'Configset Not loaded.'
            );
            return '';
        }
    }
    /**
     * load the configset content for setting up the FAZ logging
     * @returns {Promise} configset content
     */
    protected async loadFazIntegration(): Promise<string> {
        try {
            const config = await this.platform.loadConfigSet('fazintegration');
            this.alreadyLoaded.push('fazintegration');
            return config;
        } catch (error) {
            this.proxy.logAsWarning(
                "[fazintegration] configset doesn't exist in the assets storage. " +
                    'Configset Not loaded.'
            );
            return '';
        }
    }
    /**
     * load a batch of configset content
     * @param {string[]} configSetNameList configset name(s) separated by comma
     * @param {boolean} customLocation configset is loaded from the custom asset location
     * @param {boolean} throwError whether throw (just one) error or not
     * @returns {Promise} configset content
     */
    protected async loadBatch(
        configSetNameList: string[],
        customLocation,
        throwError
    ): Promise<string> {
        let customConfigSetContentArray = [];
        let errorCount = 0;
        const loaderArray = configSetNameList
            .filter(n => !this.alreadyLoaded.includes(n))
            .map(name =>
                this.platform
                    .loadConfigSet(name, customLocation)
                    .then(content => {
                        this.alreadyLoaded.push(name);
                        return `${content}\n`;
                    })
                    .catch(() => {
                        errorCount++;
                        this.proxy.logAsWarning(
                            `[${name}] configset doesn't exist in the assets storage. ` +
                                'Configset Not loaded.'
                        );
                        return '';
                    })
            );
        if (loaderArray.length > 0) {
            customConfigSetContentArray = await Promise.all(loaderArray);
        }
        if (throwError && errorCount > 0) {
            throw new Error('Error occurred when loading some configsets. Please check the log.');
        }
        return customConfigSetContentArray.join('');
    }
    /**
     * load the custom configset content from user defined custom configset location
     * @returns {Promise} configset content
     */
    protected async loadUserCustom(): Promise<string> {
        try {
            const blobs: Blob[] = await this.platform.listConfigSet(null, true);
            let fileCount = 0;
            let loadedCount = 0;
            let errorCount = 0;
            const contents: string[] = await Promise.all(
                blobs
                    .filter(blob => {
                        // exclude those filename starting with a dot
                        return !blob.fileName.startsWith('.');
                    })
                    .map(blob => {
                        fileCount++;
                        return this.platform
                            .loadConfigSet(blob.fileName, true)
                            .then(content => {
                                loadedCount++;
                                return content;
                            })
                            .catch(error => {
                                errorCount++;
                                this.proxy.logAsWarning(error);
                                return '';
                            });
                    })
            );
            this.proxy.logAsInfo(
                `Total files: ${fileCount}. ${loadedCount} loaded. ${errorCount} error.`
            );
            return contents.join('\n');
        } catch (error) {
            this.proxy.logForError('Error in listing files in container.', error);
            return '';
        }
    }
    /**
     * load all required configset(s) content and combine them into one string
     * @returns {Promise} configset content
     */
    protected async loadConfig(): Promise<string> {
        this.proxy.logAsInfo('calling FortiGateBootstrapConfigStrategy.loadConfig');
        let baseConfig = '';
        // check if second nic is enabled in the settings
        // configset for the second nic
        // must be loaded prior to the base config
        if (this.settings.get(FortiGateAutoscaleSetting.EnableNic2).truthValue) {
            baseConfig += `${await this.loadPort2()}\n`;
        }
        baseConfig += `${await this.loadBase()}\n`; // always load base config

        // check if internal elb integration is enabled in the settings
        // then load the corresponding config set
        if (this.settings.get(FortiGateAutoscaleSetting.EnableInternalElb).truthValue) {
            baseConfig += `${await this.loadInternalElbWeb()}\n`;
        }
        // check if faz integration is enabled in the settings
        // then load the corresponding config set
        if (this.settings.get(FortiGateAutoscaleSetting.EnableFazIntegration).truthValue) {
            baseConfig += `${await this.loadFazIntegration()}\n`;
        }
        // check if any other additional configsets is required
        // the name list is string of a comma-separated name list, and can be splitted into
        // a valid string array
        // NOTE: additional required configsets should be processed second last
        const additionalConfigSetNameList =
            this.settings.get(FortiGateAutoscaleSetting.AdditionalConfigSetNameList).value || '';

        // splits the string into an array of string without whitespaces
        const additionalConfigSetArray =
            (additionalConfigSetNameList &&
                additionalConfigSetNameList
                    .split(/(?<=,|^)[ ]*([a-z1-9]+)[ ]*(?=,|$)/)
                    .filter(a => !!a && !a.includes(','))) ||
            [];

        // load additional required configsets
        if (additionalConfigSetArray.length > 0) {
            baseConfig += await this.loadBatch(additionalConfigSetArray, false, false);
        }

        // finally, try to include every configset stored in the user custom location
        // NOTE: user custom configsets should be processed last
        baseConfig += `${await this.loadUserCustom()}\n`;
        this.proxy.logAsInfo('called FortiGateBootstrapConfigStrategy.loadConfig');
        return baseConfig;
    }
    /**
     * process a given config string. Should not be overriidden in any derivied class.
     *
     * @protected
     * @param {string} config the config sets in string type.
     * @param {{}} sourceData a given object containing sorcce data to be used.
     * @returns {string} a processed config sets in string type.
     */
    protected processConfig(config: string, sourceData?: unknown): string {
        if (sourceData) {
            config = this.processConfigV2(config, sourceData);
        }

        // NOTE: All those values to pass to FOS CLI must be normalized, then be enclosed with
        // double quotes.
        // Also, enclosure with double quotes is not part of normalizeFOSCmdInput()'s functionality.
        // We enclose the placeholders with double quotes in configset files and programatically
        // replace the placeholders with the normalized values.
        const psksecret = this.normalizeFOSCmdInput(
            this.settings.get(FortiGateAutoscaleSetting.FortiGatePskSecret).value
        );
        const syncInterface =
            this.normalizeFOSCmdInput(
                this.settings.get(FortiGateAutoscaleSetting.FortiGateSyncInterface).value
            ) || 'port1';
        const trafficPort =
            this.normalizeFOSCmdInput(
                this.settings.get(FortiGateAutoscaleSetting.FortiGateTrafficPort).value
            ) || '443';
        const trafficProtocol =
            this.normalizeFOSCmdInput(
                this.settings.get(FortiGateAutoscaleSetting.FortiGateTrafficProtocol).value
            ) || 'ALL';
        const adminPort =
            this.normalizeFOSCmdInput(
                this.settings.get(FortiGateAutoscaleSetting.FortiGateAdminPort).value
            ) || '8443';
        const intElbDns = this.normalizeFOSCmdInput(
            this.settings.get(FortiGateAutoscaleSetting.FortiGateInternalElbDns).value
        );
        const hbInterval = this.normalizeFOSCmdInput(
            this.settings.get(FortiGateAutoscaleSetting.HeartbeatInterval).value
        );
        const hbCallbackUrl =
            this.normalizeFOSCmdInput(
                this.settings.get(FortiGateAutoscaleSetting.AutoscaleHandlerUrl).value
            ) || '';
        const virtualNetworkCidr =
            this.normalizeFOSCmdInput(
                this.settings.get(FortiGateAutoscaleSetting.FortiGateAutoscaleVirtualNetworkCidr)
                    .value
            ) || '';
        const fazIp =
            this.normalizeFOSCmdInput(
                this.settings.get(FortiGateAutoscaleSetting.FortiAnalyzerIp).value
            ) || '';
        return config
            .replace(new RegExp('{SYNC_INTERFACE}', 'gm'), syncInterface)
            .replace(new RegExp('{VIRTUAL_NETWORK_CIDR}', 'gm'), virtualNetworkCidr)
            .replace(new RegExp('{EXTERNAL_INTERFACE}', 'gm'), 'port1')
            .replace(new RegExp('{INTERNAL_INTERFACE}', 'gm'), 'port2')
            .replace(new RegExp('{PSK_SECRET}', 'gm'), psksecret)
            .replace(new RegExp('{TRAFFIC_PORT}', 'gm'), trafficPort)
            .replace(new RegExp('{TRAFFIC_PROTOCOL}', 'gm'), trafficProtocol.toUpperCase())
            .replace(new RegExp('{ADMIN_PORT}', 'gm'), adminPort)
            .replace(new RegExp('{INTERNAL_ELB_DNS}', 'gm'), intElbDns)
            .replace(new RegExp('{CALLBACK_URL}', 'gm'), hbCallbackUrl)
            .replace(new RegExp('{HEART_BEAT_INTERVAL}', 'gm'), hbInterval)
            .replace(new RegExp('{FAZ_PRIVATE_IP}', 'gm'), fazIp);
    }
    /**
     * Process config using a given source data
     *
     * @protected
     * @param {string} config the config sets in string type
     * @param {{}} sourceData a given object containing sorcce data to be used.
     * @returns {string} a processed config sets in string type.
     */
    protected processConfigV2(config: string, sourceData: unknown): string {
        const resourceMap = {};
        Object.assign(resourceMap, sourceData);
        let conf = config;
        const nodePaths = config.match(/{(@[a-zA-Z_-]+(#\d+)*)+(\.[a-zA-Z_-]+(#\d+)*)+}/gm) || [];
        try {
            for (const nodePath of nodePaths) {
                let replaceBy = null;
                // check if it is in v2 format: {@SourceType.property[#num][.subProperty[#num]...]}
                const [, resRoot] = /^{(@[a-zA-Z_-]+(#\d+)*)+(\.[a-zA-Z_-]+(#\d+)*)+}$/gm.exec(
                    nodePath
                );
                if (resRoot && resourceMap[resRoot]) {
                    replaceBy = configSetResourceFinder(resourceMap, nodePath);
                }
                if (replaceBy) {
                    conf = conf.replace(new RegExp(nodePath, 'g'), replaceBy);
                }
            }
            return this.processConfig(conf); // process config V1
        } catch (error) {
            this.proxy.logForError('error in processing config, config not processed.', error);
            // if error occurs, return the original config
            return config;
        }
    }

    /**
     * To normalize a string in order for a safe use as the input value for the FOS commands.
     * Keep in mind that this function does not wrap the output string with an extra double quotes.
     *
     * @param {string} input the input string to normalize
     * @returns {string} the normalized input string
     */
    protected normalizeFOSCmdInput(input: string): string {
        // NOTE:
        // FOS CLI has a better input acceptance for string literal enclosing with double quotes
        // than single quotes. Every symbol on the keyboard except for \ and " is accepted in a
        // double-quoted string literal. Symbol \ and " need to add a leading \ (escape character).
        return (input && input.replace(/[\\"]/g, m => `\\${m}`)) || null;
    }
    /**
     * get bootstrap configuration for a FGT vm which's role will be primary
     * @param  {string} config configset content
     * @param  {VirtualMachine} targetVm the target vm which will consume this configuration
     * @returns {Promise} configset content
     */
    protected getPrimaryRoleConfig(config: string, targetVm: VirtualMachine): Promise<string> {
        return Promise.resolve(this.processConfigV2(config, { '@device': targetVm }));
    }
    /**
     * get bootstrap configuration for a FGT vm which's role will be secondary
     * @param  {string} config configset content
     * @param  {VirtualMachine} targetVm the target vm which will consume this configuration
     * @param  {VirtualMachine} primaryVm (optional) the target vm which will be the primary (active)
     * role in the HA cluster
     * @returns {Promise} configset content
     */
    protected getSecondaryRoleConfig(
        config: string,
        targetVm: VirtualMachine,
        primaryVm?: VirtualMachine
    ): Promise<string> {
        // TODO: remove when master-slave terminology is fully abandoned in all FOS version
        const setMasterIpSection =
            (primaryVm && `\n    set master-ip ${primaryVm.primaryPrivateIpAddress}`) || '';
        const setPrimaryIpSection =
            (primaryVm && `\n    set primary-ip ${primaryVm.primaryPrivateIpAddress}`) || '';
        const conf = this.processConfig(config, { '@device': targetVm });
        // TODO: fix it when primary/secondary terminology has been used in FOS CLI command.
        // NOTE: primary/secondary terminology is only available since FOS 7.0.1
        return Promise.resolve(
            conf
                .replace(new RegExp('set role master', 'gm'), `set role slave${setMasterIpSection}`)
                .replace(
                    new RegExp('set role primary', 'gm'),
                    `set role secondary${setPrimaryIpSection}`
                )
        );
    }
}
