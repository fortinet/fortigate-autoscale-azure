import {
    Autoscale,
    AutoscaleEnvironment,
    AutoscaleHandler,
    BootstrapConfigurationStrategy,
    BootstrapContext,
    CloudFunctionProxy,
    HttpError,
    LicensingModelContext,
    PlatformAdapter,
    ReqType,
    VirtualMachine
} from '../core';
import * as HttpStatusCodes from 'http-status-codes';
import { FortiGateAutoscaleSetting } from '.';

export const PRODUCT_NAME_FORTIGATE = 'fortigate';

/**
 * FortiGate class with capabilities:
 * cloud function handling,
 * bootstrap configuration,
 * secondary nic attachment
 */
export abstract class FortiGateAutoscale<TReq, TContext, TRes> extends Autoscale
    implements AutoscaleHandler<TReq, TContext, TRes>, BootstrapContext, LicensingModelContext {
    bootstrapConfigStrategy: BootstrapConfigurationStrategy;
    async handleAutoscaleRequest(
        proxy: CloudFunctionProxy<TReq, TContext, TRes>,
        platform: PlatformAdapter,
        env: AutoscaleEnvironment
    ): Promise<TRes> {
        let responseBody: string;
        try {
            this.proxy = proxy;
            this.platform = platform;
            this.env = env;
            this.proxy.logAsInfo('calling handleAutoscaleRequest.');
            this.proxy.logAsInfo('request integrity check.');

            // init the platform. this step is important
            await this.platform.init();
            const requestType = await this.platform.getRequestType();
            if (requestType === ReqType.LaunchingVm) {
                responseBody = await this.handleLaunchingVm();
            } else if (requestType === ReqType.LaunchedVm) {
                responseBody = await this.handleLaunchedVm();
            } else if (requestType === ReqType.VmNotLaunched) {
                responseBody = await this.handleLaunchedVm();
            } else if (requestType === ReqType.BootstrapConfig) {
                responseBody = await this.handleBootstrap();
            } else if (requestType === ReqType.HeartbeatSync) {
                responseBody = await this.handleHeartbeatSync();
            } else if (requestType === ReqType.StatusMessage) {
                // NOTE: FortiGate sends status message on some internal conditions, could ignore
                // those status messages for now.
                this.proxy.logAsInfo('FortiGate status message is received but ignored.');
                responseBody = '';
            } else if (requestType === ReqType.TerminatingVm) {
                responseBody = await this.handleTerminatingVm();
            } else if (requestType === ReqType.TerminatedVm) {
                responseBody = await this.handleTerminatedVm();
            }
            this.proxy.logAsInfo('called handleAutoscaleRequest.');
            return proxy.formatResponse(HttpStatusCodes.OK, responseBody, {});
        } catch (error) {
            // ASSERT: error is always an instance of Error
            let httpError: HttpError;
            this.proxy.logForError('called handleAutoscaleRequest.', error);
            if (!(error instanceof HttpError)) {
                httpError = new HttpError(
                    HttpStatusCodes.INTERNAL_SERVER_ERROR,
                    (error as Error).message
                );
            } else {
                httpError = error;
            }
            return proxy.formatResponse(httpError.status, '', {});
        }
    }

    async handleLicenseRequest(
        proxy: CloudFunctionProxy<TReq, TContext, TRes>,
        platform: PlatformAdapter,
        env: AutoscaleEnvironment
    ): Promise<TRes> {
        let responseBody: string;
        try {
            this.proxy = proxy;
            this.platform = platform;
            this.env = env;
            this.proxy.logAsInfo('calling handleLicenseRequest.');
            this.proxy.logAsInfo('request integrity check.');

            // init the platform. this step is important
            await this.platform.init();
            const requestType = await this.platform.getRequestType();
            if (requestType === ReqType.ByolLicense) {
                responseBody = await this.handleLicenseAssignment(PRODUCT_NAME_FORTIGATE);
            } else {
                throw new Error(`Unsupported request type: ${requestType}.`);
            }
            this.proxy.logAsInfo('called handleLicenseRequest.');
            return proxy.formatResponse(HttpStatusCodes.OK, responseBody, {});
        } catch (error) {
            // ASSERT: error is always an instance of Error
            let httpError: HttpError;
            this.proxy.logForError('called handleLicenseRequest.', error);
            if (!(error instanceof HttpError)) {
                httpError = new HttpError(
                    HttpStatusCodes.INTERNAL_SERVER_ERROR,
                    (error as Error).message
                );
            } else {
                httpError = error;
            }
            return proxy.formatResponse(httpError.status, '', {});
        }
    }

    setBootstrapConfigurationStrategy(strategy: BootstrapConfigurationStrategy): void {
        this.bootstrapConfigStrategy = strategy;
    }
    async handleBootstrap(): Promise<string> {
        this.proxy.logAsInfo('calling handleBootstrap.');
        let error: Error;
        // load target vm
        if (!this.env.targetVm) {
            this.env.targetVm = await this.platform.getTargetVm();
        }
        // if target vm doesn't exist, unknown request
        if (!this.env.targetVm) {
            error = new Error(`Requested non-existing vm (id:${this.env.targetId}).`);
            this.proxy.logForError('', error);
            throw error;
        }
        // load target healthcheck record
        this.env.targetHealthCheckRecord =
            this.env.targetHealthCheckRecord ||
            (await this.platform.getHealthCheckRecord(this.env.targetVm.id));

        // if there exists a health check record for this vm, this request may probably be
        // a duplicate request. ignore it.
        if (this.env.targetHealthCheckRecord) {
            this.proxy.logAsWarning(
                `Health check record for vm (id: ${this.env.targetVm.id}) ` +
                    'already exists. It seems this bootstrap configuration request is duplicate.'
            );
        } else {
            // if primary is elected?
            // get primary vm
            if (!this.env.primaryVm) {
                this.env.primaryVm = await this.platform.getPrimaryVm();
            }
            // get primary record
            this.env.primaryRecord =
                this.env.primaryRecord || (await this.platform.getPrimaryRecord());

            // NOTE: from FortiGate Autoscale 3.4.0, the primary election will not be handled
            // on the bootstrap stage.
            // Each VM will be initially launched as a secondary role until it becomes in-service
            // and has a healthcheck record in the DB.
            // As the result, the following processing will not be triggered here
            // handlePrimaryElection()
            // handleTaggingAutoscaleVm()
            // handleEgressTrafficRoute()
        }

        // get the bootstrap configuration
        await this.bootstrapConfigStrategy.apply();
        const bootstrapConfig = this.bootstrapConfigStrategy.getConfiguration();
        // output configuration content in debug level so that we can turn it off on production
        this.proxy.logAsDebug('configuration loaded.', `configuration: ${bootstrapConfig}`);
        this.proxy.logAsInfo('called handleBootstrap.');
        return bootstrapConfig;
    }

    /**
     * @override
     */
    async onVmFullyConfigured(): Promise<void> {
        this.proxy.logAsInfo('calling FortiGateAutoscale.onVmFullyConfigured.');
        // NOTE: if enable FAZ integration, register vm in FAZ
        const settings = await this.platform.getSettings();
        if (settings.get(FortiGateAutoscaleSetting.EnableFazIntegration).truthValue) {
            this.proxy.logAsInfo('FAZ integration is enabled.');
            await this.fazIntegrationStrategy.createAuthorizationRequest(this.env.targetVm);
        }
        // call the same method in the parent
        super.onVmFullyConfigured();
        this.proxy.logAsInfo('called FortiGateAutoscale.onVmFullyConfigured.');
    }

    /**
     * Register a FortiAnalyzer to the FortiGate Autoscale
     * @param {string} vmId the vmId of the FortiAnalyzer
     * @param {string} privateIp the privateIp of the FortiAnalyzer
     */
    async registerFortiAnalyzer(vmId: string, privateIp: string): Promise<void> {
        this.proxy.logAsInfo('calling FortiGateAutoscale.registerFortiAnalyzer.');
        await this.platform.registerFortiAnalyzer(vmId, privateIp, true, privateIp);
        this.proxy.logAsInfo('called FortiGateAutoscale.registerFortiAnalyzer.');
    }

    /**
     * authorize new devices already connected to the FortiAnalyzer
     * @param {string} vmId the vmId of the FortiGate to be authorized in in FortiAnalyzer.
     * Currently with limitation, the FortiAnalyzer will authorize all new device connected to it.
     */
    async triggerFazDeviceAuth(vmId?: string): Promise<void> {
        this.proxy.logAsInfo('calling FortiGateAutoscale.triggerFazDeviceAuth.');
        let targetVm: VirtualMachine;
        if (vmId) {
            // list and match the vm by id
            const autoscaleVmList = await this.platform.listAutoscaleVm();
            [targetVm] =
                (Array.isArray(autoscaleVmList) && autoscaleVmList.filter(vm => vm.id === vmId)) ||
                [];
        }
        await this.fazIntegrationStrategy.createAuthorizationRequest(targetVm);
        this.proxy.logAsInfo('called FortiGateAutoscale.triggerFazDeviceAuth.');
    }
}
