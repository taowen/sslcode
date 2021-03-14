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


async function archiveOldSnapshots(newSnapshot) {
    const snapshots = (await cbsClient.DescribeSnapshots({
        Filters: [{
            Name: 'snapshot-name',
            Values: ['sslcode']
        }]
    })).SnapshotSet;
    for (const snapshot of snapshots) {
        if (newSnapshot.SnapshotId === snapshot.SnapshotId) {
            continue;
        }
        const result = await cbsClient.ModifySnapshotAttribute({
            SnapshotId: snapshot.SnapshotId,
            SnapshotName: 'archival',
            IsPermanent: false,
            Deadline: new Date(new Date().getTime() + 3600 * 24 * 2 * 1000).toISOString().replace('T', ' ').substr(0, 19)
        });
        console.log('modify snapshot', result);
    }
}

async function createSnapshot(disk) {
    const result = await cbsClient.CreateSnapshot({
        DiskId: disk.DiskId,
        SnapshotName: 'sslcode',
    });
    console.log('create snapshot', result);
    while (true) {
        await sleep(500);
        const snapshots = (
            await cbsClient.DescribeSnapshots({
                SnapshotIds: [result.SnapshotId],
            })
        ).SnapshotSet;
        console.log(snapshots[0].SnapshotId, snapshots[0].SnapshotState);
        if (snapshots[0].SnapshotState !== 'CREATING') {
            return snapshots[0];
        }
    }
}

async function getInstance() {
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
    if (instances.length !== 1) {
        console.log('sslcode instance has not been created', instances);
        throw new Error('sslcode instance has not been created');
    }
    return instances[0];
}

async function terminateInstance() {
    const instance = await getInstance();
    const result = await cvmClient.TerminateInstances({
        InstanceIds: [instance.InstanceId],
    });
    console.log('terminate instance', result);
    while (true) {
        await sleep(1500);
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
            console.log(instances[0].InstanceId, instances[0].InstanceState);
        } else {
            break;
        }
    }
}

async function getDisk() {
    let disks = (
        await cbsClient.DescribeDisks({
            Filters: [
                {
                    Name: 'disk-name',
                    Values: ['sslcode'],
                },
            ],
        })
    ).DiskSet;
    disks = disks.filter(disk => disk.DiskName === 'sslcode');
    if (disks.length !== 1) {
        console.log('sslcode disk has not been created', disks);
        throw new Error('sslcode disk has not been created');
    }
    return disks[0];
}

async function terminateDisk(disk) {
    while ((await getDisk()).DiskState !== 'UNATTACHED') {
        await sleep(500);
    }
    const result = await cbsClient.TerminateDisks({
        DiskIds: [disk.DiskId],
    });
    console.log('terminate disk', result);
}

exports.main_handler = async (event, context) => {
    const disk = await getDisk();
    const newSnapshot = await createSnapshot(disk);
    await archiveOldSnapshots(newSnapshot);
    await terminateInstance();
    await terminateDisk(disk);
};

exports.main_handler();
