'use strict';

const tencentcloud = require('tencentcloud-sdk-nodejs');
const CbsClient = tencentcloud.cbs.v20170312.Client;
const cbsClient = new CbsClient({
    credential: require('./credential'),
    region: 'ap-bangkok',
    profile: {
        httpProfile: {
            endpoint: 'cbs.tencentcloudapi.com',
        },
    },
});
const CvmClient = tencentcloud.cvm.v20170312.Client;
const cvmClient = new CvmClient({
    credential: require('./credential'),
    region: 'ap-bangkok',
    profile: {
        httpProfile: {
            endpoint: 'cvm.tencentcloudapi.com',
        },
    },
});

async function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function findSnapshot() {
    const snapshots = (
        await cbsClient.DescribeSnapshots({
            Filters: [
                {
                    Name: 'snapshot-name',
                    Values: ['sslcode'],
                },
            ],
        })
    ).SnapshotSet;
    if (snapshots.length === 0) {
        throw new Error('sslcode snapshot not found');
    }
    console.log('found snapshot', snapshots[0]);
    return snapshots[0];
}

async function assertNoDisk() {
    const disks = (
        await cbsClient.DescribeDisks({
            Filters: [
                {
                    Name: 'disk-name',
                    Values: ['sslcode'],
                },
            ],
        })
    ).DiskSet;
    if (disks.length !== 0) {
        console.log('sslcode disk has already been created', disks);
        throw new Error('sslcode disk has already been created');
    }
}

async function createDisk() {
    const snapshot = await findSnapshot();
    await assertNoDisk();
    const result = await cbsClient.CreateDisks({
        DiskChargeType: 'POSTPAID_BY_HOUR',
        DiskCount: 1,
        DiskName: 'sslcode',
        DiskSize: 20,
        DiskType: 'CLOUD_SSD',
        Placement: {
            ProjectId: 0,
            Zone: 'ap-bangkok-1',
        },
        SnapshotId: snapshot.SnapshotId,
        Shareable: false,
    });
    console.log('create disks', result);
    while (true) {
        await sleep(500);
        const disks = (
            await cbsClient.DescribeDisks({
                DiskIds: [result.DiskIdSet[0]],
            })
        ).DiskSet;
        console.log(disks[0].DiskId, disks[0].DiskState);
        if (disks[0].DiskState !== 'CREATING') {
            return disks[0];
        }
    }
}

async function assertNoInstance() {
    const instances = (
        await cvmClient.DescribeInstances({
            Filters: [
                {
                    Name: 'instance-name',
                    Values: ['sslcode'],
                },
            ],
        })
    ).InstanceSet;
    if (instances.length !== 0) {
        console.log('sslcode instance has already been created', instances);
        throw new Error('sslcode instance has already been created');
    }
}

async function createInstance() {
    await assertNoInstance();
    const result = await cvmClient.RunInstances({
        InstanceChargeType: 'SPOTPAID',
        Placement: {
            Zone: 'ap-bangkok-1',
            ProjectId: 0,
        },
        InstanceMarketOptions: {
            SpotOptions: {
                MaxPrice: '1000',
            },
        },
        VirtualPrivateCloud: {
            AsVpcGateway: false,
            VpcId: 'vpc-r5t1fjpq',
            SubnetId: 'subnet-rtek5vp5',
            Ipv6AddressCount: 0,
        },
        InstanceType: 'S2.LARGE8',
        ImageId: 'img-bgfz0fdm',
        SystemDisk: {
            DiskSize: 50,
            DiskType: 'CLOUD_PREMIUM',
        },
        InternetAccessible: {
            InternetMaxBandwidthOut: 100,
            PublicIpAssigned: true,
            InternetChargeType: 'TRAFFIC_POSTPAID_BY_HOUR',
        },
        InstanceName: 'sslcode',
        TagSpecification: [
            {
                ResourceType: 'instance',
                Tags: [{ Key: 'sslcode', Value: 'true' }],
            },
        ],
        LoginSettings: {
            KeepImageLogin: 'true',
        },
        SecurityGroupIds: ['sg-fwu447qy'],
        InstanceCount: 1,
        EnhancedService: {
            SecurityService: {
                Enabled: true,
            },
            MonitorService: {
                Enabled: true,
            },
        },
    });
    console.log('run instance', result);
    while (true) {
        await sleep(500);
        const instances = (
            await cvmClient.DescribeInstances({
                InstanceIds: [result.InstanceIdSet[0]],
            })
        ).InstanceSet;
        console.log(instances[0].InstanceId, instances[0].InstanceState);
        if (instances[0].InstanceState !== 'PENDING') {
            return instances[0];
        }
    }
}

async function attachDisk(disk, instance) {
    const result = await cbsClient.AttachDisks({
        DiskIds: [disk.DiskId],
        InstanceId: instance.InstanceId,
    });
    console.log('attach disk', result);
}

exports.main_handler = async (event, context) => {
    let disk = createDisk();
    let instance = createInstance();
    disk = await disk;
    instance = await instance;
    await attachDisk(disk, instance);
    console.log(`http://${instance.PublicIpAddresses[0]}:2515`);
};

exports.main_handler();
