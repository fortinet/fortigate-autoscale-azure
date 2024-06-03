import {
    CloudFunctionProxyAdapter,
    FazDeviceAuthorization,
    FazIntegrationStrategy,
    PlatformAdapter,
    VirtualMachine
} from '..';
import {
    FortiAnalyzerConnector,
    FortiGateAutoscaleFunctionInvocable,
    FortiGateAutoscaleSetting
} from '.';

export class NoopFazIntegrationStrategy implements FazIntegrationStrategy {
    platform: PlatformAdapter;
    proxy: CloudFunctionProxyAdapter;
    constructor(platform: PlatformAdapter, proxy: CloudFunctionProxyAdapter) {
        this.platform = platform;
        this.proxy = proxy;
    }
    createAuthorizationRequest(): Promise<void> {
        this.proxy.logAsInfo('calling NoopFazIntegrationStrategy.createAuthorizationRequest.');
        this.proxy.logAsInfo('no operation required.');
        this.proxy.logAsInfo('called NoopFazIntegrationStrategy.createAuthorizationRequest.');
        return Promise.resolve();
    }

    processAuthorizationRequest(): Promise<void> {
        this.proxy.logAsInfo('calling NoopFazIntegrationStrategy.processAuthorizationRequest.');
        this.proxy.logAsInfo('no operation required.');
        this.proxy.logAsInfo('called NoopFazIntegrationStrategy.processAuthorizationRequest.');
        return Promise.resolve();
    }
}

export class FazReactiveAuthorizationStrategy implements FazIntegrationStrategy {
    constructor(
        readonly platform: PlatformAdapter,
        readonly proxy: CloudFunctionProxyAdapter
    ) {}
    /**
     * create an authorization request for a FortiGate device. This process is run asynchronously.
     * this method is called as part of the high level Autoscale business logics.
     * @param {VirtualMachine} vm the vm to process FAZ authorization in a different Lambda function
     * instance.
     */
    async createAuthorizationRequest(vm?: VirtualMachine): Promise<void> {
        this.proxy.logAsInfo('calling FazReactiveRegsitrationStrategy.createAuthorizationRequest.');
        // TODO: require implementation
        const settings = await this.platform.getSettings();
        const settingFazIntegration = settings.get(FortiGateAutoscaleSetting.EnableFazIntegration);
        const enableFazIntegration = settingFazIntegration && settingFazIntegration.truthValue;
        // ignore if not faz integration enabled
        if (!enableFazIntegration) {
            this.proxy.logAsInfo('FAZ integration not enabled.');
            this.proxy.logAsInfo(
                'called FazReactiveRegsitrationStrategy.createAuthorizationRequest.'
            );
            return;
        }
        const settingFazHandlerName = settings.get(
            FortiGateAutoscaleSetting.FortiAnalyzerHandlerName
        );
        const handlerName = settingFazHandlerName && settingFazHandlerName.value;
        if (!handlerName) {
            throw new Error('Faz handler name not defined in settings.');
        }

        const payload: FazDeviceAuthorization = {
            vmId: (vm && vm.id) || undefined,
            privateIp: (vm && vm.primaryPrivateIpAddress) || undefined,
            publicIp: (vm && vm.primaryPublicIpAddress) || undefined
        };

        // invoke asynchronously to process this authorization request.
        // the target Lambda function will run the same strategy.
        await this.platform.invokeAutoscaleFunction(
            payload,
            handlerName,
            FortiGateAutoscaleFunctionInvocable.TriggerFazDeviceAuth
        );
        this.proxy.logAsInfo('called FazReactiveRegsitrationStrategy.createAuthorizationRequest.');
        return;
    }

    /**
     * Communicate with FortiAnalyzer to process the device authorizations.
     * This process is run asynchronously.
     * this method is called as part of the high level Autoscale business logics.
     * @param {FazDeviceAuthorization} device the information about the device to be registered
     * in the FAZ
     * @param {string} host FAZ public IP
     * @param {string} port FAZ port
     * @param {string} username Autoscale admin username for authorizations
     * @param {string} password Autoscale admin password for authorizations
     */
    async processAuthorizationRequest(
        device: FazDeviceAuthorization,
        host: string,
        port: string,
        username: string,
        password: string
    ): Promise<void> {
        this.proxy.logAsInfo('calling FazReactiveRegsitrationStrategy.processAuthorizationRequest');
        const fazConnector: FortiAnalyzerConnector = new FortiAnalyzerConnector(host, Number(port));
        const connected = await fazConnector.connect(username, password);
        if (!connected) {
            // if cannot connect to the faz, don't show error, but return immediately.
            this.proxy.logAsWarning('cannot connect to faz.');
            this.proxy.logAsInfo(
                'calling FazReactiveRegsitrationStrategy.processAuthorizationRequest'
            );
            return;
        }
        const devices = await fazConnector.listDevices();
        // TODO: is it possible to identify each device by ip address? so it can detect whether
        // the device is the one passed down for authorization in order to ensure that particular
        // device is authorized.
        await fazConnector.authorizeDevice(
            devices.filter(dev => {
                return dev && device && true; // in the future, may only filter the device.
            })
        );
        this.proxy.logAsInfo(
            `${(devices && devices.length) || '0'} devices in total have been authorized.`
        );
        this.proxy.logAsInfo('calling FazReactiveRegsitrationStrategy.processAuthorizationRequest');
    }
}
