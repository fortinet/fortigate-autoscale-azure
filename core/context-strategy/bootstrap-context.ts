// the no-shadow rule errored in the next line may be just a false alarm
// eslint-disable-next-line no-shadow
export enum BootstrapConfigStrategyResult {
    SUCCESS,
    FAILED
}

export interface BootstrapConfigurationStrategy {
    getConfiguration(): string;
    apply(): Promise<BootstrapConfigStrategyResult>;
}

export interface BootstrapContext {
    setBootstrapConfigurationStrategy(strategy: BootstrapConfigurationStrategy): void;
    handleBootstrap(): Promise<string>;
}
