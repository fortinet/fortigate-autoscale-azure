import { CloudFunctionProxyAdapter, TaggingVmStrategy, VmTagging } from '../core';
import { AzurePlatformAdapter } from '.';

export class AzureTaggingAutoscaleVmStrategy implements TaggingVmStrategy {
    protected platform: AzurePlatformAdapter;
    protected proxy: CloudFunctionProxyAdapter;
    protected taggings: VmTagging[];
    constructor(platform: AzurePlatformAdapter, proxy: CloudFunctionProxyAdapter) {
        this.platform = platform;
        this.proxy = proxy;
    }
    prepare(taggings: VmTagging[]): Promise<void> {
        this.taggings = taggings;
        return Promise.resolve();
    }
    async apply(): Promise<void> {
        this.proxy.logAsInfo('calling AzureTaggingAutoscaleVmStrategy.apply');
        const creationTaggings: VmTagging[] = this.taggings.filter(tagging => !tagging.clear);
        const deletionTaggings: VmTagging[] = this.taggings.filter(tagging => tagging.clear);
        if (creationTaggings.length > 0) {
            await this.add(creationTaggings);
        }
        if (deletionTaggings.length > 0) {
            await this.clear(deletionTaggings);
        }
        this.proxy.logAsInfo('calling AzureTaggingAutoscaleVmStrategy.apply');
    }
    add(taggings: VmTagging[]): Promise<void> {
        this.proxy.logAsInfo('calling AzureTaggingAutoscaleVmStrategy.add');
        this.proxy.logAsInfo('skipped. not yet implemented.');
        this.proxy.logAsInfo(`value passed to parameter: taggings: ${JSON.stringify(taggings)}.`);
        this.proxy.logAsInfo('called AzureTaggingAutoscaleVmStrategy.add');
        return Promise.resolve();
    }

    clear(taggings: VmTagging[]): Promise<void> {
        this.proxy.logAsInfo('calling AzureTaggingAutoscaleVmStrategy.clear');
        this.proxy.logAsInfo('skipped. not yet implemented.');
        this.proxy.logAsInfo(`value passed to parameter: taggings: ${JSON.stringify(taggings)}.`);
        this.proxy.logAsInfo('called AzureTaggingAutoscaleVmStrategy.clear');
        return Promise.resolve();
    }
}
