import { AutoscaleEnvironment } from '../autoscale-environment';
import { AutoscaleSetting } from '../autoscale-setting';
import { CloudFunctionProxyAdapter, LogLevel } from '../cloud-function-proxy';
import { waitFor, WaitForConditionChecker, WaitForPromiseEmitter } from '../helper-function';
import { PlatformAdapter } from '../platform-adapter';
import {
    HealthCheckRecord,
    HealthCheckResult,
    HealthCheckResultDetail,
    HealthCheckSyncState as HeartbeatSyncState,
    PrimaryRecord,
    PrimaryRecordVoteState
} from '../primary-election';
import { VirtualMachine } from '../virtual-machine';

export interface PrimaryElection {
    oldPrimary?: VirtualMachine;
    oldPrimaryRecord?: PrimaryRecord;
    newPrimary: VirtualMachine;
    newPrimaryRecord: PrimaryRecord;
    candidate: VirtualMachine;
    candidateHealthCheck?: HealthCheckRecord;
    preferredScalingGroup?: string;
    electionDuration?: number;
    signature: string; // to identify a primary election
}

// the no-shadow rule errored in the next line may be just a false alarm
// eslint-disable-next-line no-shadow
export enum PrimaryElectionStrategyResult {
    CannotDeterminePrimary = 'CannotDeterminePrimary',
    CompleteAndContinue = 'CompleteAndContinue',
    SkipAndContinue = 'SkipAndContinue'
}
export interface PrimaryElectionStrategy {
    prepare(election: PrimaryElection): Promise<void>;
    result(): Promise<PrimaryElection>;
    apply(): Promise<PrimaryElectionStrategyResult>;
    readonly applied: boolean;
}

export interface HeartbeatSyncStrategy {
    prepare(vm: VirtualMachine): Promise<void>;
    apply(): Promise<HealthCheckResult>;
    /**
     * Force the target vm to go into 'out-of-sync' state. Autoscale will stop accepting its
     * heartbeat sync request.
     * @returns {Promise} void
     */
    forceOutOfSync(): Promise<boolean>;
    readonly targetHealthCheckRecord: HealthCheckRecord | null;
    readonly healthCheckResult: HealthCheckResult;
    readonly healthCheckResultDetail: HealthCheckResultDetail;
    readonly targetVmFirstHeartbeat: boolean;
}

export interface VmTagging {
    vmId: string;
    newVm?: boolean;
    newPrimaryRole?: boolean;
    clear?: boolean;
}

export interface TaggingVmStrategy {
    prepare(taggings: VmTagging[]): Promise<void>;
    apply(): Promise<void>;
}

export interface RoutingEgressTrafficStrategy {
    apply(): Promise<void>;
}

/**
 * To provide Autoscale basic logics
 */
export interface AutoscaleContext {
    setPrimaryElectionStrategy(strategy: PrimaryElectionStrategy): void;
    handlePrimaryElection(): Promise<PrimaryElection | null>;
    setHeartbeatSyncStrategy(strategy: HeartbeatSyncStrategy): void;
    handleHeartbeatSync(): Promise<string>;
    setTaggingAutoscaleVmStrategy(strategy: TaggingVmStrategy): void;
    handleTaggingAutoscaleVm(taggings: VmTagging[]): Promise<void>;
    setRoutingEgressTrafficStrategy(strategy: RoutingEgressTrafficStrategy): void;
    handleEgressTrafficRoute(): Promise<void>;
    onVmFullyConfigured(): Promise<void>;
}

export class PreferredGroupPrimaryElection implements PrimaryElectionStrategy {
    env: PrimaryElection;
    platform: PlatformAdapter;
    res: PrimaryElection;
    proxy: CloudFunctionProxyAdapter;
    private _applied: boolean;
    constructor(platform: PlatformAdapter, proxy: CloudFunctionProxyAdapter) {
        this.platform = platform;
        this.proxy = proxy;
    }
    prepare(env: PrimaryElection): Promise<void> {
        this.env = env;
        this.res = {
            oldPrimary: this.env.oldPrimary,
            oldPrimaryRecord: this.env.oldPrimaryRecord,
            newPrimary: null, // no initial new primary
            newPrimaryRecord: null, // no initial new primary record
            candidate: this.env.candidate,
            candidateHealthCheck: this.env.candidateHealthCheck,
            preferredScalingGroup: this.env.preferredScalingGroup,
            electionDuration: this.env.electionDuration,
            signature: ''
        };
        this._applied = false;
        return Promise.resolve();
    }

    get applied(): boolean {
        return this._applied;
    }

    result(): Promise<PrimaryElection> {
        return Promise.resolve(this.res);
    }
    async apply(): Promise<PrimaryElectionStrategyResult> {
        this.proxy.log('applying PreferredGroupPrimaryElection strategy.', LogLevel.Log);
        this._applied = true;
        const result = await this.run();
        this.proxy.log('applied PreferredGroupPrimaryElection strategy.', LogLevel.Log);
        return result;
    }
    /**
     * Only vm in the specified byol scaling group can be elected as the new primary
     */
    async run(): Promise<PrimaryElectionStrategyResult> {
        const settings = await this.platform.getSettings();
        // get the primary scaling group
        const settingGroupName = settings.get(AutoscaleSetting.PrimaryScalingGroupName).value;
        // candidate not in the preferred scaling group? no election will be run
        if (this.env.candidate.scalingGroupName !== settingGroupName) {
            this.proxy.log(
                `The candidate (id: ${this.env.candidate.id}) ` +
                    "isn't in the preferred scaling group. It cannot run a primary election. " +
                    'Primary election not started.',
                LogLevel.Warn
            );
            this.res.newPrimary = null;
            this.res.newPrimaryRecord = null;
            return PrimaryElectionStrategyResult.SkipAndContinue;
        }
        const signature = this.env.candidate
            ? `${this.env.candidate.scalingGroupName}:${this.env.candidate.id}`
            : '';
        // created using the candidate info
        const newPrimaryRecord: PrimaryRecord = {
            id: `${signature}`,
            ip: this.env.candidate.primaryPrivateIpAddress,
            vmId: this.env.candidate.id,
            scalingGroupName: this.env.candidate.scalingGroupName,
            virtualNetworkId: this.env.candidate.virtualNetworkId,
            subnetId: this.env.candidate.subnetId,
            voteEndTime: null,
            voteState: PrimaryRecordVoteState.Pending
        };

        // if has candidate healthcheck record, that means this candidate is already in-service
        // but is in a non-primary role (e.g. secondary role or not yet assigned a role).
        // KNOWN ISSUE: if a brand new device is the primary candidate and it wins
        // the election to become the new primary, ALL CONFIGURATION WILL BE LOST
        // TODO: need to find a more qualified candidate, or develop a technique to sync
        // the configuration.
        // solution:
        // for the classic case:
        // check if this device is a new device (not yet monitored)
        // if there is an existing device in the cluster, this device is not qualified.
        // if there isn't any other existing device in the cluster, this device is qualified.
        let healthcheckRecords: HealthCheckRecord[] = [];
        const deviceSyncInfo = await this.platform.getReqDeviceSyncInfo();
        // NOTE: classic handling method: no device sync info
        if (!deviceSyncInfo.syncTime) {
            // KNOWN ISSUE: in the classic election method, the Autoscale handler is lack of information
            // from the device's point of view regarding sync state.
            // There's no way to guarantee the configuration persists.

            // if this is a running healthy vm that exists in Autoscale health monitor, it is
            // eligible and can be deemed the new primary immediately.
            if (this.env.candidateHealthCheck && this.env.candidateHealthCheck.healthy) {
                newPrimaryRecord.voteEndTime = Date.now(); // election ends immediately
                newPrimaryRecord.voteState = PrimaryRecordVoteState.Done;
                this.res.newPrimary = this.env.candidate;
                this.res.newPrimaryRecord = newPrimaryRecord;
                // immediately return
                return PrimaryElectionStrategyResult.CompleteAndContinue;
            }
            // otherwise, check if there's any other vm already exists in the monitor, those
            // vm would be a better primary candidate
            else {
                // list all monitored vm
                healthcheckRecords = (await this.platform.listHealthCheckRecord()) || [];
                // filter those are healthy
                // look for any which next heartbeat time is within the period of 2 intervals
                const now = Date.now();
                const eligilePrimaryCandidates = healthcheckRecords
                    .filter(rec => rec.vmId !== this.env.candidate.id)
                    .filter(rec => rec.healthy)
                    .filter(rec => {
                        return (
                            rec.healthy &&
                            rec.nextHeartbeatTime >= now - rec.heartbeatInterval * 1000 * 3 // 3 - 1 = 2
                        );
                    });
                // if there is other eligible candidate, this vm becomes ineligible
                if (eligilePrimaryCandidates.length > 0) {
                    this.res.newPrimary = null;
                    this.res.newPrimaryRecord = null;
                    return PrimaryElectionStrategyResult.SkipAndContinue;
                }
                // otherwise, it is considered eligible
                // in this case, this vm does not sync with the previous primary
                // because there's no recored primary in the Autoscale and the Autoscale
                // isn't able to know about the sync state of any vm. (the new method:
                // device sync info method is developed to solve this problem)
                else {
                    this.res.newPrimary = this.env.candidate;
                    // since it is a new vm, there's no health record for it.
                    // a new record will be created
                    this.res.newPrimaryRecord = newPrimaryRecord;
                    return PrimaryElectionStrategyResult.CompleteAndContinue;
                }
            }
        }
        // NOTE: enhanced handling method: has device sync info method
        else {
            // workflow: if current VM is healthy
            // unhealty vm is ineligible
            // NOTE: only if there is a health check record of this target vm can check
            // its health state.
            // target vm without a health check record will be treated as healthy in this case
            if (this.env.candidateHealthCheck && !this.env.candidateHealthCheck.healthy) {
                this.res.newPrimary = null;
                this.res.newPrimaryRecord = null;
                return PrimaryElectionStrategyResult.SkipAndContinue;
            } else {
                // workflow: if VM is a primary role
                // if the vm hasn't been assigned a role, or
                // if the vm has been assigned a primary role, should check if its checksum is
                // the checksum of the majority VM.
                // pick the primary from the majority group in the cluster.
                // if no HA sync has formed in the cluster yet, none of the VM in the cluster
                // should have established a checksum. in this case, this VM is eligible
                if (deviceSyncInfo.isPrimary || deviceSyncInfo.isPrimary === null) {
                    // workflow: compare checksum with other VMs
                    // list all monitored vm
                    healthcheckRecords = (await this.platform.listHealthCheckRecord()) || [];
                    // NOTE: need to ensure this primary device is the one of the majority
                    // of all secondary device are in-sync with.
                    const checksumCount = new Map<string, number>();
                    healthcheckRecords
                        // remove those have a null checksum
                        .filter(rec => rec.deviceChecksum !== null)
                        // remove those aren't secondary role
                        .filter(rec => rec.deviceIsPrimary !== false)
                        // count the number of each different checksum
                        .forEach(rec => {
                            if (checksumCount.has(rec.deviceChecksum)) {
                                checksumCount.set(
                                    rec.deviceChecksum,
                                    checksumCount.get(rec.deviceChecksum) + 1
                                );
                            } else {
                                checksumCount.set(rec.deviceChecksum, 1);
                            }
                        });
                    // sort the checksum descendingly
                    const descSortedEntries = Array.from(checksumCount.entries()).sort(
                        (entryA, entryB) => {
                            if (entryA[1] > entryB[1]) {
                                return 1;
                            } else if (entryA[1] < entryB[1]) {
                                return -1;
                            } else {
                                return 0;
                            }
                        }
                    );
                    // workflow: if checksum match
                    // in the descendingly sorted entries of checksum, the first row
                    // is the checksum of the majority
                    // if the candidate checksum is the same as the first row, it is
                    // eligible for a primary candiate
                    // NOTE: if no available checksum in the cluster, the vm is eligible
                    if (
                        descSortedEntries.length === 0 ||
                        (descSortedEntries.length > 0 &&
                            deviceSyncInfo.checksum === descSortedEntries[0][0])
                    ) {
                        this.res.newPrimary = this.env.candidate;
                        this.res.newPrimaryRecord = newPrimaryRecord;
                        return PrimaryElectionStrategyResult.CompleteAndContinue;
                    }
                    // otherwise, ineligible
                    else {
                        this.res.newPrimary = null;
                        this.res.newPrimaryRecord = null;
                        return PrimaryElectionStrategyResult.SkipAndContinue;
                    }
                }
                // if this vm is a secondary role
                // workflow: check vm sync info: in-sync
                // workflow: if is in-sync with primary
                // if in-sync, it will be eligible
                if (this.env.candidateHealthCheck.deviceSyncStatus) {
                    this.res.newPrimary = this.env.candidate;
                    this.res.newPrimaryRecord = newPrimaryRecord;
                    return PrimaryElectionStrategyResult.CompleteAndContinue;
                }
                // otherwise, ineligible
                else {
                    this.res.newPrimary = null;
                    this.res.newPrimaryRecord = null;
                    return PrimaryElectionStrategyResult.SkipAndContinue;
                }
            }
        }
    }
}

export class WeightedScorePreferredGroupPrimaryElection extends PreferredGroupPrimaryElection {
    /** @override super.apply() */
    async apply(): Promise<PrimaryElectionStrategyResult> {
        this.proxy.log(
            'applying WeightedScorePreferredGroupPrimaryElection strategy.',
            LogLevel.Log
        );
        const result = await super.apply();
        this.proxy.log(
            'applied WeightedScorePreferredGroupPrimaryElection strategy.',
            LogLevel.Log
        );
        return result;
    }

    /** @override super.run() */
    async run(): Promise<PrimaryElectionStrategyResult> {
        // check if device sync info method applies or not.
        // will use the weighted score election strategy only if the device sync info is available
        const deviceSyncInfo = await this.platform.getReqDeviceSyncInfo();
        // if device sync info is available, the send time will not be null
        if (deviceSyncInfo.time === null) {
            return this.runClassicElectionMethod();
        } else {
            return this.runDeviceSyncInfoElectionMethod();
        }
    }

    /**
     * This method will run the classic primary election that does not facilitate the device
     * sync info provided by each VM
     * @returns {PrimaryElectionStrategyResult} election result
     */
    private runClassicElectionMethod(): Promise<PrimaryElectionStrategyResult> {
        return super.run();
    }

    /**
     * This method will run the primary election that makes uses of the device sync info
     * provided by each VM. The sync info will be kept in the healthcheck record of each VM
     * @returns {PrimaryElectionStrategyResult} election result
     */
    private async runDeviceSyncInfoElectionMethod(): Promise<PrimaryElectionStrategyResult> {
        const settings = await this.platform.getSettings();
        // get the primary scaling group
        const settingGroupName = settings.get(AutoscaleSetting.PrimaryScalingGroupName).value;
        // get all monitored vm health check records and filter the healthy ones
        const allHealthCheckRecords: HealthCheckRecord[] = (
            await this.platform.listHealthCheckRecord()
        )
            // exclude unhealthy vm from election
            .filter(rec => rec.healthy)
            // exclude irresponsive vm from election
            .filter(rec => rec.irresponsivePeriod === 0)
            // exclude those are not in the preferred scaling group for primary election
            .filter(rec => rec.scalingGroupName === settingGroupName);

        // if no vm healthcheck record available, end election
        if (allHealthCheckRecords.length === 0) {
            this.proxy.log(
                "There isn't any healthy vm in the preferred scaling group for primary election." +
                    'Primary election not started.',
                LogLevel.Warn
            );
            this.res.newPrimary = null;
            this.res.newPrimaryRecord = null;
            return PrimaryElectionStrategyResult.SkipAndContinue;
        }

        // scores
        const scores: Map<string, number> = new Map();
        allHealthCheckRecords.forEach(rec => {
            scores.set(rec.vmId, 0);
        });
        for (const rec of allHealthCheckRecords) {
            let points = scores.get(rec.vmId);
            // apply weighting methods
            points += this.haveChecksumWeight(rec);
            points += this.sharedChecksumWeight(rec, allHealthCheckRecords);
            points += this.groupedChecksumWeight(rec, allHealthCheckRecords);
            points += this.primaryDeviceWeight(rec);
            points += this.lateslGroupChecksumWeight(rec, allHealthCheckRecords);
            points += this.latestSynctimeWeight(rec, allHealthCheckRecords);
            scores.set(rec.vmId, points);
        }

        // if there's one and only one rec has the highest score, it will be elected as the
        // new primary
        let electedPrimaryId: string;
        let highestScore = 0;
        let multipleHighest = false;
        scores.forEach((score, vmId) => {
            if (score > highestScore) {
                highestScore = score;
                electedPrimaryId = vmId;
                multipleHighest = false;
            } else if (score === highestScore) {
                multipleHighest = true;
            }
        });
        let electedPrimaryHealthCheckRecord: HealthCheckRecord;
        if (highestScore > 0 && !multipleHighest) {
            [electedPrimaryHealthCheckRecord] = allHealthCheckRecords.filter(
                rec => rec.vmId === electedPrimaryId
            );
        }

        // if no primary can be determined using the weighted methods, try the special method.
        // NOTE: special condition. usually occurs in the intial state where all VM are initially
        // launched as a secondary role, never sync with any other.
        // in this case whichever has the oldest send_time will be the election primary
        // run the method to find the one
        if (!electedPrimaryHealthCheckRecord) {
            electedPrimaryId = this.fairWeight(scores, allHealthCheckRecords);
            [electedPrimaryHealthCheckRecord] = allHealthCheckRecords.filter(
                rec => rec.vmId === electedPrimaryId
            );
        }

        // still cannot determine the primary, election strategy ends.
        if (!electedPrimaryHealthCheckRecord) {
            this.res.newPrimary = null;
            this.res.newPrimaryRecord = null;
            return PrimaryElectionStrategyResult.CannotDeterminePrimary;
        }

        const primaryVm = await this.platform.getVmById(
            electedPrimaryHealthCheckRecord.vmId,
            electedPrimaryHealthCheckRecord.scalingGroupName
        );

        // if cannot find the vm, which is rare, do not set this.env.newPrimary
        this.res.newPrimary = primaryVm || null;

        const primaryRecord: PrimaryRecord = {
            id: electedPrimaryHealthCheckRecord.scalingGroupName,
            ip: electedPrimaryHealthCheckRecord.ip,
            vmId: electedPrimaryHealthCheckRecord.vmId,
            scalingGroupName: electedPrimaryHealthCheckRecord.scalingGroupName,
            virtualNetworkId: (primaryVm && primaryVm.virtualNetworkId) || '',
            subnetId: (primaryVm && primaryVm.subnetId) || '',
            voteEndTime: Date.now(), // election ends immediately,
            voteState: PrimaryRecordVoteState.Done
        };

        this.res.newPrimaryRecord = primaryRecord;
        return PrimaryElectionStrategyResult.CompleteAndContinue;
    }

    /**
     * get (1) point if a record has non-null checksum
     * @param {HealthCheckRecord} rec the healthcheck record to earn points
     * @returns {number} point
     */
    haveChecksumWeight(rec: HealthCheckRecord): number {
        return rec.deviceChecksum ? 1 : 0;
    }
    /**
     * get (2) points if the record shares the same checksum (non-null) with at least one other VM in the group
     * @param {HealthCheckRecord} rec the healthcheck record to earn points
     * @param {HealthCheckRecord[]} groups the group of healthcheck records
     * @returns {number} point
     */
    sharedChecksumWeight(rec: HealthCheckRecord, groups: HealthCheckRecord[]): number {
        const sameChecksums = groups.filter(
            g =>
                g.vmId !== rec.vmId &&
                g.deviceChecksum !== null &&
                g.deviceChecksum === rec.deviceChecksum
        );
        return (sameChecksums.length > 0 && 2) || 0;
    }
    /**
     * return a map of id array with checksum as map key
     * @param {HealthCheckRecord[]} groups groups to process
     * @returns {Map} Map<checksum, [id]>
     */
    private groupByChecksum(groups: HealthCheckRecord[]): Map<string, string[]> {
        const checksumGroups: Map<string, string[]> = new Map();
        groups.forEach(grec => {
            let ids: string[] = [];
            if (checksumGroups.has(grec.deviceChecksum)) {
                ids = [...checksumGroups.get(grec.deviceChecksum)];
            }
            checksumGroups.set(grec.deviceChecksum, [grec.vmId, ...ids]);
        });
        return checksumGroups;
    }
    /**
     * get (4) points if all these conditions are met:
     * 1. some of all records can be grouped by checksum and each group must have more than 1 group member (forming checksum group)
     * 2. if forming checksum groups, there will be one group whose number of member is geater than any other group (forming major checksum group)
     * 3. the checksum of the major checksum group must not be null
     * 4. the target record is in the major checksum group
     * @param {HealthCheckRecord} rec the healthcheck record to earn points
     * @param {HealthCheckRecord[]} groups the group of healthcheck records
     * @returns {number} point
     */
    groupedChecksumWeight(rec: HealthCheckRecord, groups: HealthCheckRecord[]): number {
        const checksumGroups: Map<string, string[]> = this.groupByChecksum(groups);
        let largestCount = 1;
        let multipleGroupOfSameCount = false;
        let majorChecksum: string;
        // find the major checksum group
        checksumGroups.forEach((ids, checksum) => {
            if (ids.length > largestCount) {
                largestCount = ids.length;
                multipleGroupOfSameCount = false;
                majorChecksum = checksum;
            } else if (ids.length === largestCount) {
                multipleGroupOfSameCount = true;
            }
        });
        // check if the rec is in the major checksum group
        const inMajorChecksumGroup =
            !multipleGroupOfSameCount && majorChecksum === rec.deviceChecksum;
        // check null before return;
        return inMajorChecksumGroup && rec.deviceChecksum !== null ? 4 : 0;
    }

    /**
     * get (8) points if the record has the latest synctime among all members in the group.
     * @param {HealthCheckRecord} rec the healthcheck record to earn points
     * @param {HealthCheckRecord[]} groups the group of healthcheck records
     * @returns {number} point
     */
    latestSynctimeWeight(rec: HealthCheckRecord, groups: HealthCheckRecord[]): number {
        // if rec has null sync time then it gets 0 point
        if (rec.deviceSyncTime === null) {
            return 0;
        }
        const checksumGroups: Map<string, string[]> = this.groupByChecksum(groups);
        const ids = checksumGroups.get(rec.deviceChecksum); // get ids of the checksum group where the rec is in
        const latestSyncTime: Date = new Date(rec.deviceSyncTime); // assume that the rec has the latest sync time
        // compare their sync time to find the latest one
        let hasLatestSyncTime = true;
        groups
            .filter(
                grec =>
                    ids.includes(grec.vmId) &&
                    grec.deviceSyncTime !== null &&
                    grec.vmId !== rec.vmId
            )
            .forEach(grec => {
                if (new Date(grec.deviceSyncTime).getTime() >= latestSyncTime.getTime()) {
                    hasLatestSyncTime = false;
                }
            });
        return hasLatestSyncTime ? 8 : 0;
    }
    /**
     * get (16) points if all these conditions are met:
     * 1. some of all records can be grouped by checksum and each group must have more than 1 group member (forming checksum group)
     * 2. the latest sync time out of all records is in this checksum group (forming latest checksum group)
     * 3. the latest sync time must not be in other checksum group
     * 4. the target record is in this latest checksum group
     * @param {HealthCheckRecord} rec the healthcheck record to earn points
     * @param {HealthCheckRecord[]} groups the group of healthcheck records
     * @returns {number} point
     */
    lateslGroupChecksumWeight(rec: HealthCheckRecord, groups: HealthCheckRecord[]): number {
        const syncTimeGroups: Map<string, Date> = new Map(); // get sort out the latest sync time of each checksum
        groups
            .filter(grec => grec.deviceSyncTime !== null)
            .forEach(grec => {
                if (
                    !syncTimeGroups.has(grec.deviceChecksum) ||
                    new Date(grec.deviceSyncTime).getTime() >
                        syncTimeGroups.get(grec.deviceChecksum).getTime()
                ) {
                    syncTimeGroups.set(grec.deviceChecksum, new Date(grec.deviceSyncTime));
                }
            });
        // find the checksum that has the latest sync time and how many checksum share this time
        let latestSyncTime: Date = new Date(0);
        let latestSyncTimeCount = 0;
        let checksumOfLatestSyncTime: string;
        syncTimeGroups.forEach((syncTime, checksum) => {
            if (syncTime.getTime() > latestSyncTime.getTime()) {
                latestSyncTime = new Date(syncTime);
                latestSyncTimeCount = 1;
                checksumOfLatestSyncTime = checksum;
            } else if (syncTime.getTime() === latestSyncTime.getTime()) {
                latestSyncTimeCount++;
            }
        });

        return latestSyncTimeCount === 1 && checksumOfLatestSyncTime === rec.deviceChecksum
            ? 16
            : 0;
    }
    /**
     * get (64) points if the record is set primary role
     * @param {HealthCheckRecord} rec the healthcheck record to earn points
     * @returns {number} point
     */
    primaryDeviceWeight(rec: HealthCheckRecord): number {
        return rec.deviceIsPrimary ? 64 : 0;
    }
    /**
     * one among all or none will get (128) bonus points if all these conditions are met:
     * 1. has non-null checksum
     * 2. checksum is mutually exclusive
     * 3. each record in the group has null sync_time
     * 4. each record in the group has an equal score
     * 5. send_time is the oldest
     * @param {Map} scores the scores of all participants
     * @param {HealthCheckRecord[]} groups the group of healthcheck records
     * @returns {string} vmId who will get the bonus
     */
    fairWeight(scores: Map<string, number>, groups: HealthCheckRecord[]): string {
        // check mutually exclusive and find non-null sync_time
        let foundNonNullSyncTime = false;
        const checksumCount: Map<string, number> = new Map();
        groups.forEach(grec => {
            if (grec.deviceSyncTime !== null) {
                foundNonNullSyncTime = true;
            }
            if (!checksumCount.has(grec.deviceChecksum)) {
                checksumCount.set(grec.deviceChecksum, 0);
            }
            checksumCount.set(grec.deviceChecksum, checksumCount.get(grec.deviceChecksum) + 1);
        });

        if (foundNonNullSyncTime) {
            return null;
        }

        let mutuallyExclusive = true;

        checksumCount.forEach(count => {
            if (count > 1) {
                mutuallyExclusive = false;
            }
        });
        if (!mutuallyExclusive) {
            return null;
        }

        // check equal score and oldest send time
        let hasEqualScore = true;
        let score: number = undefined;
        let oldestSendTime: Date;
        let vmId: string;
        groups.forEach(grec => {
            if (score === undefined) {
                score = scores.get(grec.vmId);
            }
            if (score !== scores.get(grec.vmId)) {
                hasEqualScore = false;
            }
            const sendTime = new Date(grec.sendTime);
            if (oldestSendTime === undefined || sendTime.getTime() < oldestSendTime.getTime()) {
                oldestSendTime = sendTime;
                vmId = grec.vmId;
            }
            // in an extreme edge condition that there are two same send time, whichever has the
            // alphabetically smaller vmId will get the point
            else if (sendTime.getTime() === oldestSendTime.getTime() && grec.vmId < vmId) {
                vmId = grec.vmId;
            }
        });

        if (!hasEqualScore) {
            return null;
        }

        return vmId;
    }
}

/**
 * The constant interval heartbeat sync strategy will handle heartbeats being fired with a
 * constant interval and not being interrupted by other events.
 * In this strategy, those heartbeats the Autoscale takes much longer time
 * to process will be dropped. It will be done by comparing the heartbeat seq before processing
 * and the seq of the healthcheck record saved in the DB at the time of record updating. If the
 * seq in both objects don't match, that means another hb has updated the record while this hb
 * is still processing. The current hb will be discarded.
 */
export class ConstantIntervalHeartbeatSyncStrategy implements HeartbeatSyncStrategy {
    protected platform: PlatformAdapter;
    protected proxy: CloudFunctionProxyAdapter;
    protected targetVm: VirtualMachine;
    protected firstHeartbeat = false;
    protected result: HealthCheckResult;
    protected resultDetail: HealthCheckResultDetail;
    protected _targetHealthCheckRecord: HealthCheckRecord;
    constructor(platform: PlatformAdapter, proxy: CloudFunctionProxyAdapter) {
        this.platform = platform;
        this.proxy = proxy;
    }
    prepare(targetVm: VirtualMachine): Promise<void> {
        this.targetVm = targetVm;
        return Promise.resolve();
    }

    async apply(): Promise<HealthCheckResult> {
        this.proxy.logAsInfo('applying ConstantIntervalHeartbeatSyncStrategy strategy.');
        let oldLossCount = 0;
        let newLossCount = 0;
        let oldInterval = 0;
        let oldNextHeartbeatTime: number;
        let oldRecordedSendTime: string;
        const deviceSyncInfo = await this.platform.getReqDeviceSyncInfo();
        const newInterval = deviceSyncInfo.interval * 1000;
        const heartbeatArriveTime: number = this.platform.createTime;
        // the calculated delay of the current heartbeat comparing to the previous one sent from
        // the same device
        let delay = 0;
        let oldSeq: number; // to be displayed in the log as: old seq -> new seq
        let useDeviceSyncInfo: boolean;
        let delayCalculationMethod = 'by arrive time';
        let delayAtSendTime = NaN;
        let delayAtArriveTime = NaN;
        let outdatedHearbeatRequest = false;
        const settings = await this.platform.getSettings();
        // number in second the max amount of delay allowed to offset the network latency
        const delayAllowance =
            Number(settings.get(AutoscaleSetting.HeartbeatDelayAllowance).value) * 1000;
        // max amount of heartbeat loss count allowed before deeming a device unhealthy
        const maxLossCount = Number(settings.get(AutoscaleSetting.HeartbeatLossCount).value);
        const syncRecoveryCountSettingItem = settings.get(AutoscaleSetting.SyncRecoveryCount);
        const syncRecoveryCount =
            syncRecoveryCountSettingItem && Number(syncRecoveryCountSettingItem.value);
        const terminateUnhealthyVmSettingItem = settings.get(AutoscaleSetting.TerminateUnhealthyVm);
        const terminateUnhealthyVm =
            terminateUnhealthyVmSettingItem && terminateUnhealthyVmSettingItem.truthValue;
        // get health check record for target vm
        // ASSERT: this.targetVm is valid
        let targetHealthCheckRecord = await this.platform.getHealthCheckRecord(this.targetVm.id);
        // the next heartbeat arrive time from the Autoscale handler perspective.
        const nextHeartbeatTime = heartbeatArriveTime + newInterval;
        // if there's no health check record for this vm,
        // can deem it the first time for health check
        if (!targetHealthCheckRecord) {
            this.firstHeartbeat = true;
            this.result = HealthCheckResult.OnTime;
            // no old next heartbeat time for the first heartbeat, use the current arrival time.
            oldNextHeartbeatTime = heartbeatArriveTime;
            // no old record for reference, use the seq provided by the device. If the seq is
            // NaN, it means no sequence provided by the device, then use 0.
            oldSeq = isNaN(deviceSyncInfo.sequence) ? 0 : deviceSyncInfo.sequence;
            targetHealthCheckRecord = {
                vmId: this.targetVm.id,
                scalingGroupName: this.targetVm.scalingGroupName,
                ip: this.targetVm.primaryPrivateIpAddress,
                primaryIp: '', // primary ip is unknown to this strategy
                heartbeatInterval: newInterval,
                heartbeatLossCount: 0, // set to 0 because it is the first heartbeat
                nextHeartbeatTime: nextHeartbeatTime,
                syncState: HeartbeatSyncState.InSync,
                syncRecoveryCount: 0, // sync recovery count = 0 means no recovery needed
                // use the device sequence if it exists or 1 as the initial sequence
                seq: !isNaN(deviceSyncInfo.sequence) ? deviceSyncInfo.sequence : 1,
                healthy: true,
                upToDate: true,
                // additional device sync info whenever provided
                sendTime: deviceSyncInfo.time,
                deviceSyncTime: deviceSyncInfo.syncTime,
                deviceSyncFailTime: deviceSyncInfo.syncFailTime,
                deviceSyncStatus: deviceSyncInfo.syncStatus,
                deviceIsPrimary: deviceSyncInfo.isPrimary,
                deviceChecksum: deviceSyncInfo.checksum,
                irresponsivePeriod: 0,
                remainingLossAllowed: maxLossCount
            };
            // create health check record
            try {
                await this.platform.createHealthCheckRecord(targetHealthCheckRecord);
            } catch (error) {
                this.proxy.logForError('createHealthCheckRecord() error.', error);
                // cannot create hb record, drop this health check
                targetHealthCheckRecord.upToDate = false;
                this.result = HealthCheckResult.Dropped;
            }
        }
        // processing regular heartbeat
        else {
            // store a copy of the set of record data before updating the record
            oldLossCount = targetHealthCheckRecord.heartbeatLossCount;
            oldInterval = targetHealthCheckRecord.heartbeatInterval;
            oldSeq = targetHealthCheckRecord.seq;
            oldNextHeartbeatTime = targetHealthCheckRecord.nextHeartbeatTime;
            delayAtArriveTime = heartbeatArriveTime - oldNextHeartbeatTime;
            oldRecordedSendTime = targetHealthCheckRecord.sendTime;
            // if the device provide more information about the heartbeat, do a more accurate
            // heartbeat calculation.
            // check if the 'time' property exists. It can indicate the availability of the device
            // info
            const deviceSendTime: Date =
                deviceSyncInfo.time !== null && new Date(deviceSyncInfo.time);
            const recordedSendTime = new Date(targetHealthCheckRecord.sendTime);
            const sendTimeDiff =
                deviceSendTime && recordedSendTime
                    ? deviceSendTime.getTime() - recordedSendTime.getTime()
                    : NaN;
            useDeviceSyncInfo = !!deviceSendTime;
            if (useDeviceSyncInfo) {
                delayCalculationMethod = 'by device send time';
                // check if the sequence is in an incremental order compared to the data in the db
                // if not, the heartbeat should be marked as outdated and to be dropped
                // NOTE: if the device has been reboorted, the sequence will be reset to 0
                // need to check the send time as well

                // if the sequence number of current heartbeat request is smaller
                // than the recorded one, there are two situations:
                // 1. the device is rebooted so the sequence has reset to 0
                // 2. the current heartbeat request has been taken longer time to process for
                // some external reasons such as platform api taking longer time to response,
                // one or more hb requests (with seq increased) have been processed and saved
                // into the db. As the result, the sequence recorded in the db will be greater
                // than the current one.

                // handling case 2
                if (deviceSyncInfo.sequence < targetHealthCheckRecord.seq && sendTimeDiff < 0) {
                    outdatedHearbeatRequest = true;
                } else {
                    // if the device seq is immediately after the recorded value
                    // check if the send time match the heartbeat interval
                    if (deviceSyncInfo.sequence === targetHealthCheckRecord.seq + 1) {
                        // compare using the device provided interval because if the interval
                        // has changedthe new heartbeat will be sent in the new interval
                        // this is the delay from the device's perspective
                        delay = sendTimeDiff - newInterval;
                    }
                    // deal with the sequence being reset on the device
                    // in this case, the sequence will be less than the recorded sequence
                    // but the device sendtime will be greater than the recorded.
                    // if such situation occurs, the delay cannot be calculated, just treat it as
                    // an on-time heartbeat.
                    else if (
                        deviceSyncInfo.sequence < targetHealthCheckRecord.seq &&
                        sendTimeDiff > 0
                    ) {
                        delay = 0;
                    }
                    // NOTE:
                    // in this situation, there are race conditions happening between some
                    // heartbeat requests. The reason is one autoscale handler is taking much
                    // longer to process another heartbeat and unable to complete before this
                    // heartbeat arrives at the handler (by a parallel cloud function process).
                    // The outcome of this situation is:
                    // for the hb which is immediate after the recorded one (new seq = old seq + 1)
                    // it will be handled in the above if-else case.
                    // for the other hb (new seq > old seq + 1), the delay cannot be calculated
                    // thus discarding the delay calculation, and trust it is an on-time hb
                    else {
                        delay = 0; // on-time hb must have a zero or negative delay
                    }
                    delayAtSendTime = delay;
                }
            }
            // calculate delay using the arrive time (classic method)
            else {
                // NOTE:
                // heartbeatArriveTime: the starting time of the function execution, considered as
                // the heartbeat arrived at the function
                // oldNextHeartbeatTime: the expected arrival time for the current heartbeat, recorded
                // in the db, updated in the previous heartbeat calculation
                // delayAllowance: the time used in the calcualtion to offest any foreseeable latency
                // outside of the function execution.
                delay = heartbeatArriveTime - oldNextHeartbeatTime - delayAllowance;
            }
            // if vm health check shows that it's already out of sync, should drop it
            if (targetHealthCheckRecord.syncState === HeartbeatSyncState.OutOfSync) {
                oldLossCount = targetHealthCheckRecord.heartbeatLossCount;
                oldInterval = targetHealthCheckRecord.heartbeatInterval;
                this.result = HealthCheckResult.Dropped;
                // if the termination of unhealthy device is set to false, out-of-sync vm should
                // be in the sync recovery stage.
                // late heartbeat will reset the sync-recovery-count while on-time heartbeat will
                // decrease the sync-recovery-count by 1 until it reaches 0 or negative integer;
                // sync recovery will change the sync-state back to in-sync
                if (!terminateUnhealthyVm) {
                    // late heartbeat will reset the sync-recovery-count
                    if (delay > 0) {
                        targetHealthCheckRecord.syncRecoveryCount = syncRecoveryCount;
                    }
                    // on-time heartbeat will decrease sync-recovery-count by 1 from until
                    // it reaches 0 or negative integer
                    else {
                        targetHealthCheckRecord.syncRecoveryCount -= 1;
                        // a complete recovery (0) will change the sync-state back to in-sync
                        if (targetHealthCheckRecord.syncRecoveryCount <= 0) {
                            targetHealthCheckRecord.syncRecoveryCount = 0;
                            targetHealthCheckRecord.heartbeatLossCount = 0;
                            newLossCount = 0;
                            targetHealthCheckRecord.syncState = HeartbeatSyncState.InSync;
                            targetHealthCheckRecord.healthy = true;
                            this.result = HealthCheckResult.Recovered; // recovered from out-of-sync
                        } else {
                            this.result = HealthCheckResult.Recovering; // still recovering
                        }
                    }
                }
            } else {
                // heartbeat is late
                if (delay > 0) {
                    // increase the heartbeat loss count by 1 if delay.
                    targetHealthCheckRecord.heartbeatLossCount += 1;
                    newLossCount = targetHealthCheckRecord.heartbeatLossCount;
                    // reaching the max amount of loss count?
                    if (targetHealthCheckRecord.heartbeatLossCount >= maxLossCount) {
                        targetHealthCheckRecord.syncState = HeartbeatSyncState.OutOfSync;
                        targetHealthCheckRecord.healthy = false;
                        // when entering out-of-sync state from in-sync state, update
                        // the sync-recovery-count in order for the device to enter the sync state
                        // recovery stage
                        targetHealthCheckRecord.syncRecoveryCount = syncRecoveryCount;
                    } else {
                        targetHealthCheckRecord.syncState = HeartbeatSyncState.InSync;
                        targetHealthCheckRecord.healthy = true;
                    }
                    this.result = HealthCheckResult.Late;
                }
                // else, no delay; heartbeat is on time; clear the loss count.
                else {
                    targetHealthCheckRecord.heartbeatLossCount = 0;
                    newLossCount = targetHealthCheckRecord.heartbeatLossCount;
                    targetHealthCheckRecord.healthy = true;
                    this.result = HealthCheckResult.OnTime;
                }
            }
            // NOTE: use the sequence provided by the device
            if (useDeviceSyncInfo && !isNaN(deviceSyncInfo.sequence)) {
                targetHealthCheckRecord.seq = deviceSyncInfo.sequence;
            } else {
                targetHealthCheckRecord.seq += 1;
            }
            targetHealthCheckRecord.heartbeatInterval = newInterval;
            targetHealthCheckRecord.nextHeartbeatTime = heartbeatArriveTime + newInterval;
            // additional device sync info whenever provided
            targetHealthCheckRecord.sendTime = deviceSyncInfo.time;
            targetHealthCheckRecord.deviceSyncTime = deviceSyncInfo.syncTime;
            targetHealthCheckRecord.deviceSyncFailTime = deviceSyncInfo.syncFailTime;
            targetHealthCheckRecord.deviceSyncStatus = deviceSyncInfo.syncStatus;
            targetHealthCheckRecord.deviceIsPrimary = deviceSyncInfo.isPrimary;
            targetHealthCheckRecord.deviceChecksum = deviceSyncInfo.checksum;
            // update health check record if not marked as outdated
            if (!outdatedHearbeatRequest) {
                try {
                    await this.platform.updateHealthCheckRecord(targetHealthCheckRecord);
                } catch (error) {
                    this.proxy.logForError('updateHealthCheckRecord() error.', error);
                    // cannot create hb record, drop this health check
                    targetHealthCheckRecord.upToDate = false;
                    this.result = HealthCheckResult.Dropped;
                }
            } else {
                this.proxy.logAsWarning('Dropped an outdated heartbeat request.');
                targetHealthCheckRecord.upToDate = false;
                this.result = HealthCheckResult.Dropped;
            }
        }
        this._targetHealthCheckRecord = targetHealthCheckRecord;
        this.resultDetail = {
            sequence: targetHealthCheckRecord.seq,
            result: this.result,
            expectedArriveTime: oldNextHeartbeatTime,
            actualArriveTime: heartbeatArriveTime,
            heartbeatInterval: newInterval,
            oldHeartbeatInerval: oldInterval,
            delayAllowance: delayAllowance,
            calculatedDelay: delay,
            actualDelay: delay + delayAllowance,
            heartbeatLossCount: newLossCount,
            maxHeartbeatLossCount: maxLossCount,
            syncRecoveryCount: targetHealthCheckRecord.syncRecoveryCount,
            maxSyncRecoveryCount: syncRecoveryCount
        };
        let logMessage =
            `Heartbeat sync result: ${this.result},` +
            ` heartbeat sequence: ${oldSeq}->${targetHealthCheckRecord.seq},` +
            ` heartbeat interval: ${oldInterval}->${newInterval} ms,` +
            ` device time for recorded heartbeat: ${oldRecordedSendTime},` +
            ` device time for received heartbeat: ${deviceSyncInfo.time},` +
            ` delay at send time: ${(isNaN(delayAtSendTime) && 'n/a') || delayAtSendTime} ms,` +
            ' heartbeat expected arrive time:' +
            ` ${new Date(oldNextHeartbeatTime).toISOString()},` +
            ` heartbeat actual arrive time: ${new Date(heartbeatArriveTime).toISOString()},` +
            ` heartbeat delay at arrive time: ${delayAtArriveTime} ms,` +
            ` heartbeat delay allowance for arrival: ${delayAllowance} ms,` +
            ` heartbeat calculated delay: ${delay > 0 ? delay : 0} ms ${delayCalculationMethod},` +
            ` heartbeat loss count: ${oldLossCount}->${newLossCount},` +
            ` max loss count allowed: ${maxLossCount}.`;
        switch (this.result) {
            case HealthCheckResult.Recovering:
                logMessage =
                    `${logMessage} This VM requires` +
                    ` ${targetHealthCheckRecord.syncRecoveryCount} out of ${syncRecoveryCount}` +
                    ' more on-time heartbeat(s) to recover from out-of-sync state' +
                    ' and to become in-sync again.';
                break;
            case HealthCheckResult.Recovered:
                logMessage =
                    `${logMessage} This VM is recovered. It's state is now:` +
                    ` ${targetHealthCheckRecord.syncState}.`;
                break;
            case HealthCheckResult.Late:
                logMessage =
                    `${logMessage} VM termination will ${terminateUnhealthyVm ? '' : 'not'} occur` +
                    ' on this VM when it enters out-of-sync state.';
                break;
            default:
                break;
        }
        this.proxy.logAsInfo(logMessage);
        this.proxy.logAsInfo('applied ConstantIntervalHeartbeatSyncStrategy strategy.');
        return this.result;
    }
    get targetHealthCheckRecord(): HealthCheckRecord {
        return this._targetHealthCheckRecord;
    }
    primaryHealthCheckRecord: HealthCheckRecord;
    get healthCheckResult(): HealthCheckResult {
        return this.result;
    }
    get healthCheckResultDetail(): HealthCheckResultDetail {
        return this.resultDetail;
    }
    get targetVmFirstHeartbeat(): boolean {
        return this.firstHeartbeat;
    }
    async forceOutOfSync(): Promise<boolean> {
        this.proxy.logAsInfo('calling ConstantIntervalHeartbeatSyncStrategy.forceOutOfSync.');
        try {
            // ASSERT: this.targetVm is valid
            const healthcheckRecord: HealthCheckRecord = await this.platform.getHealthCheckRecord(
                this.targetVm.id
            );
            // if its status is 'out-of-sync' already, don't need to update
            if (healthcheckRecord.syncState === HeartbeatSyncState.OutOfSync) {
                return true;
            }
            // update its state to be 'out-of-sync'
            const emitter: WaitForPromiseEmitter<HealthCheckRecord> = () => {
                return this.platform.getHealthCheckRecord(this.targetVm.id);
            };
            const checker: WaitForConditionChecker<HealthCheckRecord> = (record, callCount) => {
                if (callCount > 3) {
                    throw new Error(`maximum amount of attempts ${callCount} have been reached.`);
                }
                if (record.syncState === HeartbeatSyncState.OutOfSync) {
                    return Promise.resolve(true);
                } else {
                    return Promise.resolve(false);
                }
            };
            // change status to outofsync
            healthcheckRecord.syncState = HeartbeatSyncState.OutOfSync;
            await this.platform.updateHealthCheckRecord(healthcheckRecord);
            // wait for state change
            await waitFor(emitter, checker, 5000, this.proxy);
            this.proxy.logAsInfo('called ConstantIntervalHeartbeatSyncStrategy.forceOutOfSync.');
            return true;
        } catch (error) {
            this.proxy.logForError('error in forceOutOfSync()', error);
            this.proxy.logAsInfo('called ConstantIntervalHeartbeatSyncStrategy.forceOutOfSync.');
            return false;
        }
    }
}

export class NoopTaggingVmStrategy implements TaggingVmStrategy {
    private proxy: CloudFunctionProxyAdapter;
    constructor(platform: PlatformAdapter, proxy: CloudFunctionProxyAdapter) {
        this.proxy = proxy;
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    prepare(taggings: VmTagging[]): Promise<void> {
        return Promise.resolve();
    }
    apply(): Promise<void> {
        this.proxy.logAsInfo('calling NoopTaggingVmStrategy.apply.');
        this.proxy.logAsInfo('called NoopTaggingVmStrategy.apply.');
        return Promise.resolve();
    }
}

export class NoopRoutingEgressTrafficStrategy implements RoutingEgressTrafficStrategy {
    private proxy: CloudFunctionProxyAdapter;
    constructor(platform: PlatformAdapter, proxy: CloudFunctionProxyAdapter) {
        this.proxy = proxy;
    }
    prepare(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        env: AutoscaleEnvironment
    ): Promise<void> {
        return Promise.resolve();
    }
    apply(): Promise<void> {
        this.proxy.logAsInfo('calling NoopRoutingEgressTrafficStrategy.apply.');
        this.proxy.logAsInfo('called NoopRoutingEgressTrafficStrategy.apply.');
        return Promise.resolve();
    }
}
