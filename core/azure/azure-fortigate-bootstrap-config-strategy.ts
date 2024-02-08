import { AutoscaleEnvironment, CloudFunctionProxyAdapter } from '..';
import { FortiGateBootstrapConfigStrategy } from '../fortigate-autoscale';
import { AzurePlatformAdapter } from '.';

export class AzureFortiGateBootstrapStrategy extends FortiGateBootstrapConfigStrategy {
    constructor(
        readonly platform: AzurePlatformAdapter,
        readonly proxy: CloudFunctionProxyAdapter,
        readonly env: AutoscaleEnvironment
    ) {
        super();
    }
    /**
     *
     * @override for loading bootstrap config with additional AWS Transit Gateway VPN connections
     * @returns {Promise<string>} configset content
     */
    async loadConfig(): Promise<string> {
        let baseConfig = await super.loadConfig();
        // load azure only configset
        baseConfig += await this.loadExtraPorts();
        return baseConfig;
    }
    /**
     *
     * load the configset content for extra ports deployment
     * @returns {Promise<string>} configset content
     */
    async loadExtraPorts(): Promise<string> {
        this.settings = this.settings || (await this.platform.getSettings());
        try {
            return await this.platform.loadConfigSet('extraports');
        } catch (error) {
            this.proxy.logAsWarning("extraports configset doesn't exist in the assets storage.");
            // NOTE: even though not loading the tgw specific configset, return empty string instead
            // of throwing errors
            return '';
        }
    }
}
