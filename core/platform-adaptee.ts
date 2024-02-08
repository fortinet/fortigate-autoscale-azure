import { Settings } from './autoscale-setting';
export interface PlatformAdaptee {
    loadSettings(): Promise<Settings>;
    // getReqType(proxy: CloudFunctionProxyAdapter): Promise<ReqType>;
    // getReqMethod(proxy: CloudFunctionProxyAdapter): ReqMethod;
    // checkReqIntegrity(proxy: CloudFunctionProxyAdapter): void;
    // getReqBody(proxy: CloudFunctionProxyAdapter): ReqBody;
    // getReqHeaders(proxy: CloudFunctionProxyAdapter): ReqHeaders;
}
