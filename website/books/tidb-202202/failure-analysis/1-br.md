# 【故障解读】v5.3.0 BR 备份报错并且耗时比升级前更长

## 作者介绍

靳献旗，汽车之家 DBA，TUG 2021 年度 MVA，主要负责 MySQL、TiDB、MongoDB 的架构设计、性能调优、日常运维以及自动化平台开发工作。



## 问题背景

集群版本：v5.3.0

BR  版本：v5.3.0

备份命令如下：

```SQL
br backup full --pd "${pd_string}" -s "local://${bakDir}" --ratelimit 200 --log-file backup_full.log
```

集群 (v4.0.10) 和 BR (v4.0.4) 统一 升级到 5.3.0 版本后，BR 出现三个问题:

- BR 日志有报错信息

BR 日志末尾虽然显示备份成功(日志信息类似 Full backup success summary)，但是日志中包含如下报错信息：

```SQL
[2021/12/31 03:31:47.084 +08:00] [ERROR] [client.go:752] ["[pd] fetch pending tso requests error"] [dc-location=global] [error="[PD:client:ErrClientGetTSO]context canceled: context canceled"] [stack="github.com/tikv/pd/client.(*client).handleDispatcher\n\t/nfs/cache/mod/github.com/tikv/pd@v1.1.0-beta.0.20211104095303-69c86d05d379/client/client.go:752"]
```

- BR 日志显示备份文件大幅减小

升级前备份文件大小：total size(MB): 4200646.35

升级后备份文件大小：total-kv-size=2.321TB

- BR 备份耗时增加一倍多

备份耗时增加一倍多，升级前备份耗时不足 2 个小时，升级后耗时高达 5 个半小时。



## 问题分析

从 BR 备份日志入手分析问题的原因。

升级前 BR (v4.0.4 )备份日志

```SQL
[2021/12/12 23:22:01.612 +08:00] [INFO] [version.go:33] ["Welcome to Backup & Restore (BR)"]
[2021/12/12 23:22:01.612 +08:00] [INFO] [version.go:34] [BR] [release-version=v4.0.4]
[2021/12/12 23:22:01.612 +08:00] [INFO] [version.go:35] [BR] [git-hash=c91c79a8431805dcbfda2c7b2612dde6985e564c]
[2021/12/12 23:22:01.612 +08:00] [INFO] [version.go:36] [BR] [git-branch=heads/refs/tags/v4.0.4]
[2021/12/12 23:22:01.612 +08:00] [INFO] [version.go:37] [BR] [go-version=go1.13]
[2021/12/12 23:22:01.612 +08:00] [INFO] [version.go:38] [BR] [utc-build-time="2020-07-31 07:33:17"]
[2021/12/12 23:22:01.612 +08:00] [INFO] [version.go:39] [BR] [race-enabled=false]
......
[2021/12/13 01:12:12.107 +08:00] [INFO] [client.go:196] ["save backup meta"] [path=local:///dbbak/tidbFullBak/mg_tidb_full_20211212232201] [size=24088950][2021/12/13 01:12:13.021 +08:00] [INFO] [ddl.go:384] ["[ddl] DDL closed"] [ID=d57b89e9-b1c0-45a1-9659-becd4249eed3] ["take time"=198.806392ms]
[2021/12/13 01:12:13.021 +08:00] [INFO] [ddl.go:297] ["[ddl] stop DDL"] [ID=d57b89e9-b1c0-45a1-9659-becd4249eed3]
[2021/12/13 01:12:13.026 +08:00] [INFO] [domain.go:442] ["infoSyncerKeeper exited."]
[2021/12/13 01:12:13.027 +08:00] [INFO] [domain.go:612] ["domain closed"] ["take time"=203.963708ms]
[2021/12/13 01:12:13.027 +08:00] [INFO] [collector.go:61] ["Full backup Success summary: total backup ranges: 16901, total success: 16901, total failed: 0, total take(s): 6157.47, total size(MB): 4200646.35, avg speed(MB/s): 682.20,total kv: 47292061388"] ["backup checksum"=7m4.429579554s] ["backup fast checksum"=6.692480306s] ["backup total regions"=55387] [BackupTS=429738563201400858] [Size=637484128247]
```

升级后 BR (v5.3.0 )备份日志

```SQL
[2021/12/30 22:02:02.197 +08:00] [INFO] [info.go:49] ["Welcome to Backup & Restore (BR)"] [release-version=v5.3.0] [git-hash=4a1b2e9fe5b5afb1068c56de47adb07098d768d6] [git-branch=heads/refs/tags/v5.3.0] [go-version=go1.16.4] [utc-build-time="2021-11-24 13:31:09"] [race-enabled=false]
[2021/12/30 22:02:02.197 +08:00] [INFO] [common.go:630] [arguments] [__command="br backup full"] [log-file=backup_full.log] [pd="[172.16.5.225:2379,172.16.5.226:2379,172.16.5.227:2379]"] [ratelimit=200] [storage=local:///dbbak/tidbFullBak/mg_tidb_full_20211230220202]
[2021/12/30 22:02:02.197 +08:00] [INFO] [conn.go:244] ["new mgr"] [pdAddrs=172.16.5.225:2379,172.16.5.226:2379,172.16.5.227:2379]
[2021/12/30 22:02:02.199 +08:00] [INFO] [client.go:352] ["[pd] create pd client with endpoints"] [pd-address="[172.16.5.225:2379,172.16.5.226:2379,172.16.5.227:2379]"]
[2021/12/30 22:02:02.201 +08:00] [INFO] [base_client.go:349] ["[pd] switch leader"] [new-leader=http://172.16.5.226:2379] [old-leader=][2021/12/30 22:02:02.201 +08:00] [INFO] [base_client.go:104] ["[pd] init cluster id"] [cluster-id=6857095228536967924]
[2021/12/30 22:02:02.201 +08:00] [INFO] [client.go:648] ["[pd] tso dispatcher created"] [dc-location=global]
[2021/12/30 22:02:02.203 +08:00] [INFO] [conn.go:219] ["checked alive KV stores"] [aliveStores=9] [totalStores=9]
[2021/12/30 22:02:02.203 +08:00] [INFO] [client.go:352] ["[pd] create pd client with endpoints"] [pd-address="[172.16.5.225:2379,172.16.5.226:2379,172.16.5.227:2379]"]
[2021/12/30 22:02:02.204 +08:00] [INFO] [base_client.go:349] ["[pd] switch leader"] [new-leader=http://172.16.5.226:2379] [old-leader=][2021/12/30 22:02:02.205 +08:00] [INFO] [base_client.go:104] ["[pd] init cluster id"] [cluster-id=6857095228536967924]
[2021/12/30 22:02:02.205 +08:00] [INFO] [client.go:648] ["[pd] tso dispatcher created"] [dc-location=global]
[2021/12/30 22:02:02.206 +08:00] [INFO] [client.go:93] ["new backup client"]
.......
[2021/12/31 03:31:47.083 +08:00] [ERROR] [client.go:752] ["[pd] fetch pending tso requests error"] [dc-location=global] [error="[PD:client:ErrClientGetTSO]context canceled: context canceled"] [stack="github.com/tikv/pd/client.(*client).handleDispatcher\n\t/nfs/cache/mod/github.com/tikv/pd@v1.1.0-beta.0.20211104095303-69c86d05d379/client/client.go:752"]
[2021/12/31 03:31:47.083 +08:00] [INFO] [client.go:666] ["[pd] exit tso dispatcher"] [dc-location=global]
[2021/12/31 03:31:47.084 +08:00] [ERROR] [client.go:752] ["[pd] fetch pending tso requests error"] [dc-location=global] [error="[PD:client:ErrClientGetTSO]context canceled: context canceled"] [stack="github.com/tikv/pd/client.(*client).handleDispatcher\n\t/nfs/cache/mod/github.com/tikv/pd@v1.1.0-beta.0.20211104095303-69c86d05d379/client/client.go:752"]
[2021/12/31 03:31:47.084 +08:00] [INFO] [client.go:666] ["[pd] exit tso dispatcher"] [dc-location=global]
[2021/12/31 03:31:47.084 +08:00] [INFO] [collector.go:66] ["Full backup success summary"] [total-ranges=59720] [ranges-succeed=59720] [ranges-failed=0] [backup-checksum=11m11.760918579s] [backup-fast-checksum=348.085778ms] [backup-total-ranges=17057] [total-take=5h29m44.887146372s] [BackupTS=430144991341838386] [total-kv=24978943921] [total-kv-size=2.321TB] [average-speed=117.3MB/s] [backup-data-size(after-compressed)=679.6GB] [Size=679630218545]
```

（1）是否跟日志报错有关

升级后，日志有如下报错信息：

```SQL
[2021/12/31 03:31:47.084 +08:00] [ERROR] [client.go:752] ["[pd] fetch pending tso requests error"] [dc-location=global] [error="[PD:client:ErrClientGetTSO]context canceled: context canceled"] [stack="github.com/tikv/pd/client.(*client).handleDispatcher\n\t/nfs/cache/mod/github.com/tikv/pd@v1.1.0-beta.0.20211104095303-69c86d05d379/client/client.go:752"]
```

原因是：备份完成后，通过 PD 来启动 GC safepoint (备份过程中 GC safepoint 是停掉的)，备份完成 context cancel 引起的这个 ERROR，后续版本会优化相关日志和逻辑。

Bug 详情请见：https://github.com/pingcap/tidb/issues/31335

（2）是否跟备份文件大小有关

升级前备份文件大小是 total size(MB): 4200646.35，升级后备份文件大小是 total-kv-size=2.321TB，不但没增大，反而减小了，可能有以下几种原因：

(a)是否集群数据量减小导致

通过分析集群监控未发现数据量有明显变化。

(b)是否和备份文件压缩有关

升级前的 v4.0.4 版本已经开启压缩，因此和压缩无关。

(c)是否是日志显示问题

这个问题是日志显示的 bug，在 v4.0.5 版本已修复。原因是：在备份日志中重复计算备份文件大小导致的，第一次在 BackupRange 中，第二次在 checksum 中，应该删除第二次，并不是每个备份任务都带有 checksum。

Bug 详情请见：https://github.com/pingcap/br/issues/470

（3）是否跟限速有关

升级前：avg speed (MB/s): 682.20       # v4.0.4 版本

升级后：average-speed=117.3MB/s     # v5.3.0 版本

用户共计 10 个 TiKV 节点，单个 TiKV 的平均备份速度(avg speed / 10)都没有超过 ratelimit 200 的上限，且平均备份速度差异很大。需要进行下面两种场景的验证：

(a)验证限速的影响

可以对比升级前后的备份资源使用率(主要是 CPU)：在 Backup & Import -- Backup -- Backup CPU Utilization(各个版本略有不同)。用户未提供监控，无法确认。

(b)取消限速的情况

用户尝试取消限速后，备份耗时恢复到升级之前的时间，最终确认是限速导致的问题。为了避免 ratelimit 限速失败，当配置 ratelimit 时，会将 concurrency 参数从 4 修改为 1（并且配置 ratelimit 时，concurrency 参数无法配置，默认为 1）进而降低了备份大量表的速度。

Bug 详情请见：https://github.com/pingcap/br/issues/1007

升级后备份变慢的分析流程图如下：

![img](https://pingcap.feishu.cn/space/api/box/stream/download/asynccode/?code=Y2Q1MjA1ODA3OWVmNzg2ZmUzMjg5N2VjOTZlYWMwMGJfWDVvTEIyQm5JNENDenJuQnh3VU1rbXA1dW56TXpqQW9fVG9rZW46Ym94Y25iRHlETEtzblFkZWdVNVpxcERmelhnXzE2NTAxNjI5ODc6MTY1MDE2NjU4N19WNA)



## 问题结论

- BR 日志有报错信息

日志报错信息对备份没影响。

原因是：备份完成后，通过 PD 来启动 GC safepoint (备份过程中 GC safepoint 是停掉的)，备份完成 context cancel 引起的这个 ERROR，后续版本会优化相关日志和逻辑。

Bug 详情请见：https://github.com/pingcap/tidb/issues/31335

- BR 日志显示备份文件大幅减小

这个问题是 bug 导致，在 v4.0.5 版本已修复。原因是：在备份日志中重复计算备份文件大小导致的，第一次在 BackupRange 中，第二次在 checksum 中，应该删除第二次，并不是每个备份任务都带有 checksum。

Bug 详情请见：https://github.com/pingcap/br/issues/470

- BR 备份耗时增加一倍多

备份耗时增加是因为用户使用 BR 进行备份时启用了限速(ratelimit)，导致：为了避免 ratelimit 限速失败，当配置 ratelimit 时，会将 concurrency 参数从 4 修改为 1（并且配置 ratelimit 时，concurrency 参数无法配置，默认为 1）进而降低了备份大量表的速度。

Bug 详情请见：https://github.com/pingcap/br/issues/1007



## 优化措施

为了减少备份任务对在线集群的影响，从 TiDB v5.4.0 起，BR 引入了自动调节功能，此功能会默认开启。在集群资源占用率较高的情况下，BR 可以通过该功能自动限制备份使用的资源，从而减少对集群的影响。

需要注意的是，v5.3.x 版本的集群，在升级到 v5.4.0 及以上版本后，自动调节功能默认关闭，需手动开启，动态启动或停止 BR 自动调节功能命令如下：

```SQL
tikv-ctl modify-tikv-config -n backup.enable-auto-tune -v <true|false>
```

详情请见官网文档：https://docs.pingcap.com/zh/tidb/stable/br-auto-tune



## 相关知识

- BR 支持备份文件压缩

v4.0.3 版本开始支持备份文件压缩，压缩完整的支持是在 v4.0.5。

- BR 限速 Bug

在小于等于 v4.0.13 版本中存在一个限速无法正确执行的 bug，在 v4.0.14 版本修复。

- BR 参数 ratelimit 和 concurrency 问题

为了避免 ratelimit 限速失败，当配置 ratelimit 时，会将 concurrency 参数从 4 修改为 1 (并且配置 ratelimit 时，concurrency 参数无法配置，默认为 1)。

 

## 【参考】

https://asktug.com/t/topic/303447/11

https://docs.pingcap.com/zh/tidb/stable/br-auto-tune/