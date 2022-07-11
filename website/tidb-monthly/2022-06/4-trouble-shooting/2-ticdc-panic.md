---
title: TiCDC 从某些旧版本升级至某些新版本时，可能会出现 panic
hide_title: true
---

# TiCDC 从某些旧版本升级至某些新版本时，可能会出现 panic

> Dongpo Liu 

## Issue

TiCDC 在从一些旧的版本升级至某些新版本时，可能会出现 panic。

## Root Cause

这个问题是 TiCDC 内部元信息在新旧版本处理方式上不兼容导致的，触发的条件为：

- 在旧版本创建某个 changefeed，并且删除该 changefeed
- 升级至以下新版本

|                 |                       |
| --------------- | --------------------- |
| 升级前版本      | 升级后版本            |
| < 4.0.16< 5.0.6 | = 5.1.4= 5.2.4= 5.3.1 |

在升级之后就会遇到 TiCDC Server panic。

## Diagnostic Steps

在升级之后 panic 会在 cdc_stderr.log 中出现以下信息：

```
goroutine 707 [running]:

github.com/pingcap/tiflow/cdc/model.(*ChangeFeedInfo).FixIncompatible(0x0)

github.com/pingcap/tiflow/cdc/model/changefeed.go:225 +0x37

github.com/pingcap/tiflow/cdc/owner.fixChangefeedInfos.func1(0x0, 0x203000, 0x203000, 0x203000, 0x90)

github.com/pingcap/tiflow/cdc/owner/owner.go:266 +0x2b

github.com/pingcap/tiflow/cdc/model.(*ChangefeedReactorState).PatchInfo.func1(0x0, 0x0, 0x413ec2, 0xc001a35038, 0xf52f6176, 0x53ba57631af9f9da, 0x30)

github.com/pingcap/tiflow/cdc/model/reactor_state.go:296 +0xa2

github.com/pingcap/tiflow/cdc/model.(*ChangefeedReactorState).patchAny.func1(0x0, 0x0, 0x0, 0x3e, 0x4c38360, 0x2af6820, 0x1, 0xc000b95d70, 0xc001a35088)

github.com/pingcap/tiflow/cdc/model/reactor_state.go:389 +0x13a

github.com/pingcap/tiflow/pkg/orchestrator.(*SingleDataPatch).Patch(0xc000995a88, 0xc000b94600, 0xc000b95d40, 0x25, 0xc002424088)

github.com/pingcap/tiflow/pkg/orchestrator/interfaces.go:55 +0x82

github.com/pingcap/tiflow/pkg/orchestrator.getChangedState(0xc000b94600, 0xc000daab40, 0x1, 0x1, 0xc0012f79c0, 0x451, 0x0, 0x0)

github.com/pingcap/tiflow/pkg/orchestrator/batch.go:77 +0xa5

github.com/pingcap/tiflow/pkg/orchestrator.getBatchChangedState(0xc000b94600, 0xc002263600, 0x7, 0x7, 0x4, 0x4, 0xc0006386c0, 0xc001a352e0, 0x2525d13)

github.com/pingcap/tiflow/pkg/orchestrator/batch.go:41 +0x17e

github.com/pingcap/tiflow/pkg/orchestrator.(*EtcdWorker).applyPatchGroups(0xc00102e480, 0x7f6a77689028, 0xc00050a0a0, 0xc002263600, 0x7, 0x7, 0x1, 0x1, 0x0, 0x2, …)

github.com/pingcap/tiflow/pkg/orchestrator/etcd_worker.go:335 +0xc5

github.com/pingcap/tiflow/pkg/orchestrator.(*EtcdWorker).Run(0xc00102e480, 0x7f6a77689028, 0xc00050a0a0, 0xc000626270, 0xbebc200, 0x7fff8cb43e45, 0x13, 0x2c3f079, 0x5, 0x0, …)

github.com/pingcap/tiflow/pkg/orchestrator/etcd_worker.go:207 +0xb87

github.com/pingcap/tiflow/cdc/capture.(*Capture).runEtcdWorker(0xc0007c4000, 0x31f9208, 0xc00050a0a0, 0x318cc80, 0xc001408b40, 0x31b8488, 0xc001407890, 0xbebc200, 0x2c3f079, 0x5, …)

github.com/pingcap/tiflow/cdc/capture/capture.go:291 +0x185

github.com/pingcap/tiflow/cdc/capture.(*Capture).campaignOwner(0xc0007c4000, 0x31f9208, 0xc00050a0a0, 0x40dc00, 0x318dd20)

github.com/pingcap/tiflow/cdc/capture/capture.go:263 +0x6ee

github.com/pingcap/tiflow/cdc/capture.(*Capture).run.func2(0xc000050140, 0xc0007c4000, 0x31f9208, 0xc00050a0a0, 0xc0007c8140)

github.com/pingcap/tiflow/cdc/capture/capture.go:184 +0xb5

 created by github.com/pingcap/tiflow/cdc/capture.(*Capture).run

github.com/pingcap/tiflow/cdc/capture/capture.go:178 +0x2c8

 panic: runtime error: invalid memory address or nil pointer dereference

 [signal SIGSEGV: segmentation violation code=0x1 addr=0x98 pc=0x1586357]
```



## Resolution

## 解决版本：

|             |             |             |
| ----------- | ----------- | ----------- |
| release-5.1 | release-5.2 | release-5.3 |
| >= 5.1.5    | >= 5.2.5    | >= 5.3.2    |



## Workaround

## 推荐解决办法：升级策略绕过

只有上述受到影响的特定版本才会遇到这个问题，所以我们可以通过先升级到没有问题的版本再升级到目标版本的方案绕过这个问题。

例如：

- 从 4.0.14 升级至 5.2.4
  - 可以先从 4.0.14 升级至 4.0.16，再从 4.0.16 升级至 5.2.4
- 从 5.0.3 升级至 5.1.4
  - 可以先从 5.0.3 升级至 5.0.6，再从 5.0.3 升级至 5.1.4

## 升级前使用 TiCDC cli 删除无用信息

该问题主要由被删除的 changefeed 元信息没能正确处理造成，我们可以通过 TiCDC cli 强制删除已经无用的元信息。

### 操作步骤

例如：我们在该 TiCDC 上共创建过两个 changefeed，分别为 test 和 test1，test changefeed 被删除。

1. 在升级前，使用命令：`tiup cdc:v4.0.14 cli changefeed list -a` 查看所有的 changefeed，包括已经被删除的 changefeed。

```
[

  {

    "id": "test",

    "summary": {

      "state": "removed",

      "tso": 433623663868116993,

      "checkpoint": "2022-06-02 12:10:04.868",

      "error": null

    }

  },

  {

    "id": "test1",

    "summary": {

      "state": "normal",

      "tso": 433623663868116993,

      "checkpoint": "2022-06-02 12:10:04.868",

      "error": null

    }

  }

]
```

可以看到 test changefeed 的状态为 `removed`。

1. 我们可以通过命令 `tiup cdc:v4.0.14 cli changefeed remove -c test -f` 命令强制清理已经删除的 changefeed。
2. 再次使用 `tiup cdc:v4.0.14 cli changefeed list -a` 命令确保该 changefeed 已经被强制删除
3. 开始升级，升级成功

## 升级后使用 etcdctl 删除无用元信息

如果集群已经升级并遇到了这个问题，由于该问题主要由被删除的 changefeed 元信息没能正确处理造成，所以我们可以通过 etcdctl 来手动删除该元信息，这样我们就可以绕过该信息检查和 panic。

### 使用 tiup ctl etcd 或者安装 etcdctl

#### 使用 tiup ctl etcd

直接使用命令：`tiup ctl:v5.1.4 etcd -h`

#### 手动安装 etcdctl

在 [etcd 发布页面](https://github.com/etcd-io/etcd/releases/) 下载对应操作系统安装包，解压之后，直接使用 etcdctl

### 操作步骤

例如：我们在该 TiCDC 上共创建过两个 changefeed，分别为 test 和 test1，test changefeed 被删除。

1. 在升级之前，使用命令：`tiup cdc:v5.1.4 cli unsafe show-metadata` 查看当前 TiCDC 上存储的 TiCDC 元信息

```
Key: /tidb/cdc/changefeed/info/test1, Value: {"sink-uri":"blackhole://","opts":{},"create-time":"2022-05-25T15:32:35.642307+08:00","start-ts":433445655184408577,"target-ts":0,"admin-job-type":0,"sort-engine":"unified","sort-dir":"","config":{"case-sensitive":true,"enable-old-value":false,"force-replicate":false,"check-gc-safe-point":true,"filter":{"rules":["*.*"],"ignore-txn-start-ts":null},"mounter":{"worker-num":16},"sink":{"dispatchers":null,"protocol":"default"},"cyclic-replication":{"enable":false,"replica-id":0,"filter-replica-ids":null,"id-buckets":0,"sync-ddl":false},"scheduler":{"type":"table-number","polling-time":-1}},"state":"normal","history":null,"error":null,"sync-point-enabled":false,"sync-point-interval":600000000000,"creator-version":"v4.0.0-dev-dirty"}

Key: /tidb/cdc/job/test, Value: {"resolved-ts":433445659050770433,"checkpoint-ts":433445658788364289,"admin-job-type":3}

Key: /tidb/cdc/job/test1, Value: {"resolved-ts":433445698751954946,"checkpoint-ts":433445698489810945,"admin-job-type":0}

Show 3 KVs
```

我们可以看到当前 etcd 集群上残留有已经被删除的 test changefeed 信息：`/tidb/cdc/job/test`

2. 我们可以通过 etcdctl 命令删除该残留信息：`tiup ctl:v5.1.4 etcd del /tidb/cdc/job/test`
3. 再次使用命令：`tiup cdc:v5.1.4 cli unsafe show-metadata` 确保该元信息已经被删除
4. 重新启动 TiCDC，正常启动