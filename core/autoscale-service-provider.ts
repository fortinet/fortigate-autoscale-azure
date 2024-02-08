// the no-shadow rule errored in the next line may be just a false alarm
// eslint-disable-next-line no-shadow
export enum AutoscaleServiceType {
    SaveAutoscaleSettings = 'saveSettings',
    StartAutoscale = 'startAutoscale',
    StopAutoscale = 'stopAutoscale'
}
export interface AutoscaleServiceRequest {
    source: string;
    serviceType: string;
    [key: string]: string;
}

export interface AutoscaleServiceProvider<TReq, TRes> {
    handleServiceRequest(request: TReq): Promise<TRes>;
    startAutoscale(): Promise<boolean>;
    stopAutoscale(): Promise<boolean>;
    saveAutoscaleSettings(props: { [key: string]: string }): Promise<boolean>;
}
