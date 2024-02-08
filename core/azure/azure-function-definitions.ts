/* eslint-disable @typescript-eslint/naming-convention */
interface AzureFunctionDefinition {
    name: string;
    path: string;
}

export const ByolLicense: AzureFunctionDefinition = {
    name: 'byol-license',
    path: '/api/byol-license'
};

export const CustomLog: AzureFunctionDefinition = {
    name: 'custom-log',
    path: '/api/custom-log'
};

export const FazAuthScheduler: AzureFunctionDefinition = {
    name: 'faz-auth-scheduler',
    path: '/api/faz-auth-scheduler'
};

export const FortiGateAutoscaleHandler: AzureFunctionDefinition = {
    name: 'fgt-as-handler',
    path: '/api/fgt-as-handler'
};

export const FazAuthHandler: AzureFunctionDefinition = {
    name: 'faz-auth-handler',
    path: '/api/faz-auth-handler'
};
