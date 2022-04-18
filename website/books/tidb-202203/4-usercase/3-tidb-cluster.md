---
title: TiDB集群恢复之TiKV集群不可用
hide_title: true
---

# TiDB 集群恢复之 TiKV 集群不可用

**作者：代晓磊**

引入数学概率问题：之前上学时都学过，把几组小球放几个盒子，然后计算概率的问题，那么我有 10 组小球(每组 3 个)，放 5 个盒子里(每个盒子不能空着)，会有多大的概率在 2 个盒子损坏的情况下，保证每组小球至少保留 1 个？

Tikv 可用性图

![tikv-useable.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/tikv-useable-1647483282645.png)

下面对上图简单解释下：

（1）以上都是在 region 默认 3 副本的情况下的讨论。

(2) 以上的可用性都是在大量 region 的情况下，无论有多少个 tikv 节点，一个 region 的 3 个副本肯定会调度到 KV 集群的 3 个 tikv 上，3 个副本的多数副本不可用，该 region 就不可用了，大量 region 的情况下，有很大的概率同一个 raft group 的 2 个 peer 正好调度在宕机的 2 个 tikv 上，这也是为啥文章开头说概率的意义。

（3）集群可用是指：就算 DBA 不介入，整个集群也会正常提供服务。比如拿 5 个节点的 tikv cluster 来讲，每次只能宕机 1 台，tikv 宕机后，在该 tikv 上的 leader region 会根据 raft-group 来找 follwer region 来提升为新 leader，并且等 30 分钟后其他 tikv 节点补副本，最终完成 3 个副本的 raft-group；另外对于该 tikv 节点上的 follwer region，在其他 tikv 节点的 leader region 也会在另外的 tikv 节点补 follwer region 节点(3 个节点的 tikv 集群在宕机 1 台的情况下，没有多余的 kv 节点可以补副本，这时需要扩容 tikv 来补)。

（4）不丢数据是指：在 3 副本的情况下，如果多数副本(2 个副本)不可用的情况下，但是还保留着一份副本（数据没有丢），SQL 读写的表现就是：该 region 就不可用。

所以聊了 3 副本的可用性问题后，咱们就通过 5 个 tikv 节点的宕机测试来验证可用性以及数据恢复方案。

## 实验模拟 5 节点集群宕机可用性

测试环境：

![tikv-down1.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/tikv-down1-1647483335369.png)

使用 sysbench 导入 10 张 50 万数据的 table，然后 sysbench 读流量模拟请求。

```
sysbench /usr/share/sysbench/oltp_read_write.lua --mysql-host=10.xxxx.160 --mysql-port=4000 --mysql-db=test --mysql-user=root --mysql-password='xxx' --table_size=500000 --tables=10 --threads=30 --time=220 --report-interval=10 --db-driver=mysql  prepare
sysbench /usr/share/sysbench/oltp_read_only.lua --mysql-host=10.xxxx.160 --mysql-port=4000 --mysql-db=test --mysql-user=root --mysql-password='xxx' --table_size=500000 --tables=10 --threads=30 --time=2000 --report-interval=10 --db-driver=mysql run
```

### 宕机 1 台

一般宕机 1 台不用太担心，因为如上所说，region 的多数副本存活，该重新选 leader 的重新选，该补 follwer 副本的也会在其他节点补充。

在宕机 1 台，leader 还没有选举成功或者 follwer 副本还没有补充完毕时，又宕机 1 台，其实跟下面要讲的同时宕机 2 台的问题分析和处理方式一样。

![tikv-sql-slow.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/tikv-sql-slow-1647483360496.png)

通过 sysbench 的压测任务可以看出，上图中红框位置出现 20s 左右的 QPS 抖动(QPS 由之前的平均 1.2 万降低到 4 千左右)，因为 SQL 正在访问的 leader region 节点发生故障，导致 raft 重新选举新 leader 后恢复正常，下面是 tiup pd ctl 命令来查看宕机 tikv 的 store 信息。

```
tiup ctl:v5.1.1 pd -u http://10.xxxxx.173:2379 store|grep -B 10 'Disconnected'
Starting component `ctl`: /home/tidb/.tiup/components/ctl/v5.1.1/ctl /home/tidb/.tiup/components/ctl/v5.1.1/ctl pd -u http://10.xxxxx.173:2379 store
    {
      "store": {
        "id": 5,
        "address": "10.xxxx.155:20160",
        "version": "5.1.1",
        "status_address": "10.xxxx.155:20180",
        "git_hash": "4705d7c6e9c42d129d3309e05911ec6b08a25a38",
        "start_timestamp": 1628479214,
        "deploy_path": "/data6/deploy/tikv-20180/bin",
        "last_heartbeat": 1646640368489894705,
        "state_name": "Disconnected"
```

通过以上可以看到 tikv 状态为 disconnected，在这里简单提下 tikv 的状态，正常启动就是 UP 状态，当 tikv 节点跟 PD 断开超过 20s 后转变为 Disconnected 状态，默认超过 30 分钟(max-store-down-time 设定)后 tikv 转变为 down 状态，**只有变为 down 状态，其他存活的 tikv 才会补该 tikv 节点的 region 副本**。对于 down 的 tikv 我们 scale-in 后出现 offline 状态，一旦所有的 region 都正常后最终变为 tombstone 状态。

## 同时宕机 2 台

我们下面通过 rm -rf tikv-data 来暴力模拟故障，同时删除 2 个 tikv 的 data 来模拟 5 个 tikv 集群 2 个 tikv 宕机处理，看下集群当前情况：

![2tikv-down.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/2tikv-down-1647483380541.png)

再看下 sysbench 压测请求的 QPS 情况，从打印的日志明显看到有 tikv server timeout 和 region is unavailable 的报错,sysbench 报错后续的 QPS 已经变 0。

![tikv_rw_error.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/tikv_rw_error-1647483405780.png)

下面开始进行 tikv 集群的恢复，操作步骤如下：

（1）使用 tiup ctl pd(同之前的 pd-ctl 命令)来查看下 Tikv 哪些 store id 不可用了，发现是 store 1 和 6。

```
tiup ctl:v5.1.1 pd -u http://xxxx:2379 store|grep -B 10 'Disconnected'
    {
      "store": {
        "id": 6,
        "address": "10.xxxx.201:20160",
        "version": "5.1.1",
        "state_name": "Disconnected"
--
    {
      "store": {
        "id": 1,
        "address": "10.xxxx.218:20160",
        "version": "5.1.1",
        "state_name": "Disconnected"
```

（2）PD 调度关闭，避免恢复过程中产生的各种异常情况，对了，在将下面的参数调整为 0 之前，建议先 tiup ctl pd config show 看下之前的参数值为多少，另外使用 tiup ctl 时需要选择跟 tidb 集群版本一致的 ctl version。

```
$ tiup ctl:v5.1.1 pd -u http://10.xxxxx:2379 config set region-schedule-limit 0
$ tiup ctl:v5.1.1 pd -u http://10.xxxxx:2379 config set replica-schedule-limit 0
$ tiup ctl:v5.1.1 pd -u http://10.xxxxx:2379 config set leader-schedule-limit 0
$ tiup ctl:v5.1.1 pd -u http://10.xxxxx:2379 config set merge-schedule-limit 0
$ tiup ctl:v5.1.1 pd -u http://10.xxxxx:2379 operator show
[]
```

通过上面的命令可以看到调度已经关闭。

（3）停止其他 UP 状态的 tikv,目的避免新的写入导致的 region 副本之间的元信息不一致，另外就是释放文件锁。

```
tiup cluster stop BA-xxxx_bak -R tikv
```

如果上面命令停不掉，可以登录到 tikv 节点使用 systemctl stop tikv-20160 停掉 tikv

（4）在刚才关闭的每个 tikv 节点，使用 tikv-ctl 强制 region 从多副本失效的状态恢复，unsafe-recover remove-fail-stores 命令可以将故障机器从指定 Region 的 peer 列表中移除。运行命令之前，需要目标 TiKV 先停掉服务以便释放文件锁（否则执行 tikv-ctl 恢复时有下面的报错）。

```
[2022/03/14 17:51:54.215 +08:00] [ERROR] [main.rs:78] ["error while open kvdb: Storage Engine IO error: While lock file: /data6/tikv-20180/db/LOCK: Resource temporarily unavailable"]
[2022/03/14 17:51:54.215 +08:00] [ERROR] [main.rs:81] ["LOCK file conflict indicates TiKV process is running. Do NOT delete the LOCK file and force the command to run. Doing so could cause data corruption."]
```

tikv-ctl 的-s 选项是指宕机的多个以逗号分隔的 store_id (本次实验为 1 和 6)，可以使用 -r 后面跟多个逗号分隔的 Region id 来指定要移除的 peer，如果集群过大，需要移除的 region id 太多了，可简单指定 --all-regions 来对存活 store 上的全部 Region 都执行这个操作。

```
将跟集群版本适配的tikv-ctl拷贝到存活tikv节点
scp /home/tidb/.tiup/components/ctl/v5.1.1/tikv-ctl tidb@10.xxxx.155:/home/tidb
scp /home/tidb/.tiup/components/ctl/v5.1.1/tikv-ctl tidb@10.xxxx.208:/home/tidb
scp /home/tidb/.tiup/components/ctl/v5.1.1/tikv-ctl tidb@10.xxxx.238:/home/tidb
在每个存活tikv节点都执行下面的tikv-ctl命令(注意要在tikv stop的情况下)
$ ./tikv-ctl --data-dir /data6/tikv-20180 unsafe-recover remove-fail-stores -s 6,1 --all-regions
[2022/03/10 16:20:40.987 +08:00] [INFO] [mod.rs:118] ["encryption: none of key dictionary and file dictionary are found."]
[2022/03/10 16:20:40.987 +08:00] [INFO] [mod.rs:479] ["encryption is disabled."]
[2022/03/10 16:20:41.032 +08:00] [WARN] [config.rs:581] ["compaction guard is disabled due to region info provider not available"]
[2022/03/10 16:20:41.032 +08:00] [WARN] [config.rs:675] ["compaction guard is disabled due to region info provider not available"]
removing stores [6, 1] from configurations...
[2022/03/10 16:20:41.236 +08:00] [INFO] [debug.rs:586] ["peers changed"] [new_peers="[id: 1722 store_id: 5]"] [old_peers="[id: 1722 store_id: 5, id: 2111 store_id: 6, id: 2117 store_id: 1]"] [region_id=18]
[2022/03/10 16:20:41.236 +08:00] [INFO] [debug.rs:586] ["peers changed"] [new_peers="[id: 1982 store_id: 5]"] [old_peers="[id: 1944 store_id: 1, id: 1982 store_id: 5, id: 2119 store_id: 6]"] [region_id=26]
[2022/03/10 16:20:41.236 +08:00] [INFO] [debug.rs:586] ["peers changed"] [new_peers="[id: 1858 store_id: 5]"] [old_peers="[id: 1858 store_id: 5, id: 2108 store_id: 6, id: 2113 store_id: 1]"] [region_id=38]
[2022/03/10 16:20:41.236 +08:00] [INFO] [debug.rs:586] ["peers changed"] [new_peers="[id: 1717 store_id: 5]"] [old_peers="[id: 1717 store_id: 5, id: 2110 store_id: 6, id: 2115 store_id: 1]"] [region_id=46]
[2022/03/10 16:20:41.236 +08:00] [INFO] [debug.rs:586] ["peers changed"] [new_peers="[id: 1859 store_id: 5]"] [old_peers="[id: 1859 store_id: 5, id: 2112 store_id: 6, id: 2114 store_id: 1]"] [region_id=1009]
.....此处省略N行
[2022/03/10 16:20:41.237 +08:00] [INFO] [debug.rs:586] ["peers changed"] [new_peers="[id: 1880 store_id: 7, id: 1881 store_id: 5]"] [old_peers="[id: 1880 store_id: 7, id: 1881 store_id: 5, id: 1887 store_id: 1]"] [region_id=1879]
[2022/03/10 16:20:41.237 +08:00] [INFO] [debug.rs:586] ["peers changed"] [new_peers="[id: 1884 store_id: 7, id: 1886 store_id: 5, id: 2107 store_id: 4]"] [old_peers="[id: 1884 store_id: 7, id: 1886 store_id: 5, id: 2107 store_id: 4]"] [region_id=1883]
success
```

注意：--all-regions 是需要在所有 store 节点上执行的。另外就是使用了 remove-fail-store 参数后，已经被移除的节点(故障 tikv 节点)一定不能再加入集群，否则会导致 PD 元信息不一致。

(5)恢复 pd 调度配置

```
$ tiup ctl:v5.1.1 pd -u http://10.xxxxx:2379 config set region-schedule-limit 2048
$ tiup ctl:v5.1.1 pd -u http://10.xxxxx:2379 config set replica-schedule-limit 64
$ tiup ctl:v5.1.1 pd -u http://10.xxxxx:2379 config set leader-schedule-limit 4
$ tiup ctl:v5.1.1 pd -u http://10.xxxxx:2379 config set merge-schedule-limit 8
```

(6) 启动 tikv 集群，我这里是通过-R 指定所有 tikv 重启，其实建议-N 指定之前状态正常的 3 个 tikv 节点启动。

```
tiup cluster start BA-analyse-tidb_shyc_bak -R tikv
```

启动过程出现报错，因为无论是我模拟的 tikv data 目录被删，亦或是硬盘故障，主机宕机等，还是之前的 store id 为 1 和 6 的 tikv 启动失败，通过 tiup cluster display 查看还是有 3 个 tikv 节点启动成功的，不影响业务正常使用，通过继续跑 sysbench 和 count 全表，没有出现读写和表数据丢失问题。下图是随便找了 2 张 table 查看数据量也是 50w，跟之前 sysbench 导入的数据量一致。

```
mysql> select count(1) from sbtest10;
+----------+
| count(1) |
+----------+
|   500000 |
+----------+
1 row in set (0.41 sec)

mysql> select count(1) from sbtest3;
+----------+
| count(1) |
+----------+
|   500000 |
+----------+
1 row in set (0.41 sec)
```

集群现状：

![tikv-ok.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/tikv-ok-1647483426104.png)

（7）后续处理：本次的事故模拟是通过 rm -rf tikv-data 目录来实现的，并且没有从 PD 的 store 信息里删除已经 down 的 store id：1 和 6，所以上面的 tikv 重启操作默认会在“误操作”的 tikv 节点重新创建目录和启动 tikv，但是启动不成功，提示 duplicated store address，“新的 tikv”跟老的 tikv 都是同一个 ip 和端口，自然启动不成功，报错如下：

```
[2022/03/10 17:00:21.320 +08:00] [ERROR] [util.rs:460] ["request failed"] [err_code=KV:PD:gRPC] [err="Grpc(RpcFailure(RpcStatus { code: 2-UNKNOWN, message: \"duplicated store address: id:1194100 address:\\\"10.218.93.201:20160\\\" version:\\\"5.1.1\\\" status_address:\\\"10.218.93.201:20180\\\" git_hash:\\\"4705d7c6e9c42d129d3309e05911ec6b08a25a38\\\" start_timestamp:1646902817 deploy_path:\\\"/data6/deploy/tikv-20180/bin\\\" , already registered by id:6 address:\\\"10.218.93.201:20160\\\" version:\\\"5.1.1\\\" status_address:\\\"10.218.93.201:20180\\\" git_hash:\\\"4705d7c6e9c42d129d3309e05911ec6b08a25a38\\\" start_timestamp:1628479259 deploy_path:\\\"/data6/deploy/tikv-20180/bin\\\" last_heartbeat:1646897290357034075 \", details: [] }))
```

解决方案：pd 元信息删除原来的 store id，然后再重启下 2 个被 rm 又重新加入集群的“新节点”

```
$ tiup ctl:v5.1.1 pd -u http://10.xxxxx:2379 store delete 1
$ tiup ctl:v5.1.1 pd -u http://10.xxxxx:2379 store delete 6
$ tiup cluster start BA-analyse-tidb_shyc_bak -N 10.xxxx.218:20160
$ tiup cluster start BA-analyse-tidb_shyc_bak -N 10.xxxx.201:20160
```

到目前，整个集群又恢复到 5 个 tikv 完全可用的情况了，本次模拟了 5 个 tikv 节点中 2 个 tikv 数据被删除的情况下，如何恢复数据的方式和方法。

### 宕机 3 台

这次玩大的，5 台机器，直接 shutdown 3 个 tikv 节点的服务器，模拟硬件故障启动不起来。

![3tikv_down.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/3tikv_down-1647483441832.png)

处理步骤还是跟上面 2KV 宕机的步骤类似(但还是有不同)

（1）pd ctl 查看宕机的 store id，发现是 1，2，8

```
tiup ctl:v5.1.1 pd -u http://10.xxxxx:2379 store|grep -B 10 'Disconnected'
```

（2）PD 调度关闭，避免恢复过程中产生的各种异常情况。

（3）检查大于等于一半副本数在故障节点上的 region

```
tiup ctl:v5.1.1 pd -u http://10.xxxxx:2379 region --jq='.regions[] | {id: .id, peer_stores: [.peers[].store_id] | select(length as $total | map(if .==(2,8,1) then . else empty end) | length>=$total-length)}'
{"id":199,"peer_stores":[8,2,5]}
{"id":677,"peer_stores":[11,1,8]}
{"id":736,"peer_stores":[2,1,5]}
{"id":14,"peer_stores":[8,2,1]}
{"id":48,"peer_stores":[1,2,5]}
{"id":52,"peer_stores":[8,2,1]}
{"id":756,"peer_stores":[1,8,11]}
{"id":46,"peer_stores":[8,2,1]}
  .....此处省略N行
{"id":175,"peer_stores":[2,1,8]}
{"id":203,"peer_stores":[1,8,2]}
{"id":211,"peer_stores":[8,5,2]}
{"id":22,"peer_stores":[2,1,11]}
{"id":36,"peer_stores":[8,2,5]}
{"id":730,"peer_stores":[5,8,1]}
{"id":611,"peer_stores":[8,11,1]}
{"id":58,"peer_stores":[8,2,1]}
{"id":131,"peer_stores":[2,1,11]}
{"id":18,"peer_stores":[8,5,2]}
{"id":30,"peer_stores":[2,1,11]}
```

大家可以看到 region id 为 52、46、175、58 的 3 个副本都丢失了(leader 和 2 个 follower 都在宕机的 3 个 tikv 节点，如果 3 个 tikv 都无法启动或者恢复，那这 4 个 region 的数据就丢了)。另外还有不少只剩下 1 个 peer 的 region id，比如 199、677、736 等只丢了 2 个副本(还剩 1 个 peer，数据可以找回)。

（4）使用 tiup cluster stop -N 来关闭存活的 2 个 tikv

(5) 在所有未宕机的 tikv 节点,对所有 region 移除故障节点的 peer。

```
./tikv-ctl --data-dir /data6/tikv-20180/ unsafe-recover remove-fail-stores -s 2,8,1 --all-regions
[2022/03/14 20:16:22.059 +08:00] [INFO] [mod.rs:118] ["encryption: none of key dictionary and file dictionary are found."]
[2022/03/14 20:16:22.060 +08:00] [INFO] [mod.rs:479] ["encryption is disabled."]
[2022/03/14 20:16:22.104 +08:00] [WARN] [config.rs:581] ["compaction guard is disabled due to region info provider not available"]
[2022/03/14 20:16:22.104 +08:00] [WARN] [config.rs:675] ["compaction guard is disabled due to region info provider not available"]
removing stores [2, 8, 1] from configurations...
[2022/03/14 20:16:25.909 +08:00] [INFO] [debug.rs:586] ["peers changed"] [new_peers="[id: 298 store_id: 5]"] [old_peers="[id: 298 store_id: 5, id: 460 store_id: 8, id: 838 store_id: 2]"] [region_id=3]
[2022/03/14 20:16:25.909 +08:00] [INFO] [debug.rs:586] ["peers changed"] [new_peers="[id: 795 store_id: 5]"] [old_peers="[id: 13 store_id: 1, id: 755 store_id: 2, id: 795 store_id: 5]"] [region_id=12]
[2022/03/14 20:16:25.909 +08:00] [INFO] [debug.rs:586] ["peers changed"] [new_peers="[id: 829 store_id: 5]"] [old_peers="[id: 83 store_id: 8, id: 686 store_id: 2, id: 829 store_id: 5]"] [region_id=16]
[2022/03/14 20:16:25.909 +08:00] [INFO] [debug.rs:586] ["peers changed"] [new_peers="[id: 789 store_id: 5, id: 940 store_id: 11 role: Learner]"] [old_peers="[id: 715 store_id: 8, id: 789 store_id: 5, id: 836 store_id: 2, id: 940 store_id: 11 role: Learner]"] [region_id=18]
 ........此处省略N行
[2022/03/14 20:16:25.910 +08:00] [INFO] [debug.rs:586] ["peers changed"] [new_peers="[id: 447 store_id: 11, id: 688 store_id: 5]"] [old_peers="[id: 445 store_id: 2, id: 447 store_id: 11, id: 688 store_id: 5]"] [region_id=444]
[2022/03/14 20:16:25.910 +08:00] [INFO] [debug.rs:586] ["peers changed"] [new_peers="[id: 633 store_id: 5]"] [old_peers="[id: 633 store_id: 5, id: 778 store_id: 1, id: 827 store_id: 2]"] [region_id=632]
[2022/03/14 20:16:25.910 +08:00] [INFO] [debug.rs:586] ["peers changed"] [new_peers="[id: 731 store_id: 5]"] [old_peers="[id: 731 store_id: 5, id: 732 store_id: 8, id: 825 store_id: 1]"] [region_id=730]
[2022/03/14 20:16:25.910 +08:00] [INFO] [debug.rs:586] ["peers changed"] [new_peers="[id: 818 store_id: 5]"] [old_peers="[id: 737 store_id: 2, id: 745 store_id: 1, id: 818 store_id: 5]"] [region_id=736]
[2022/03/14 20:16:25.910 +08:00] [INFO] [debug.rs:586] ["peers changed"] [new_peers="[id: 750 store_id: 11, id: 751 store_id: 5]"] [old_peers="[id: 750 store_id: 11, id: 751 store_id: 5, id: 773 store_id: 8]"] [region_id=749]
success
```

注意：因为是 5 个 KV 宕机 3 台，需要在 stop tikv server 的剩余 2 台 tikv 都执行。

(6)重启 2 个存活的 tikv

(7)再次查看多数副本在宕机的 3 台 tikv 上的 region，发现就剩下这些 3 个副本都丢失的 region 了

```
tiup ctl:v5.1.1 pd -u http://10.xxxxx:2379 region --jq='.regions[] | {id: .id, peer_stores: [.peers[].store_id] | select(length as $total | map(if .==(2,8,1) then . else empty end) | length>=$total-length)}'
Starting component `ctl`: /home/tidb/.tiup/components/ctl/v5.1.1/ctl /home/tidb/.tiup/components/ctl/v5.1.1/ctl pd -u http://10.xxxxx:2379 region --jq=.regions[] | {id: .id, peer_stores: [.peers[].store_id] | select(length as $total | map(if .==(2,8,1) then . else empty end) | length>=$total-length)}
{"id":52,"peer_stores":[8,2,1]}
{"id":46,"peer_stores":[8,2,1]}
{"id":28,"peer_stores":[8,2,1]}
{"id":203,"peer_stores":[1,8,2]}
{"id":175,"peer_stores":[2,1,8]}
{"id":58,"peer_stores":[8,2,1]}
{"id":14,"peer_stores":[8,2,1]}
```

（8）查看这些 region id 所属的 table，下面拿 203 这个 region id 来查看，发现是属于 test 库的 sbtest5 表，需要查看下所有 3 个副本都丢失的 region 都属于哪些表，有时候涉及的 region 过多，可以搞个小脚本批量执行，执行结果都汇总到一个文本中，以便后续补数和业务沟通，这种情况是：反正数据已经丢了，避免业务访问到这些 reigon 的报错，需要跟业务沟通是否用空 region 代替，后续通过业务或者其他方式找回。

```
 curl http://10.xxxx.160:10086/regions/203
{
 "start_key": "dIAAAAAAAAA9X3KAAAAAAARH7A==",
 "end_key": "dIAAAAAAAABF",
 "start_key_hex": "74800000000000003d5f7280000000000447ec",
 "end_key_hex": "748000000000000045",
 "region_id": 203,
 "frames": [
  {
   "db_name": "test",
   "table_name": "sbtest5",
   "table_id": 61,
   "is_record": true,
   "record_id": 280556
  }
 ]
}
```

(9)再次关停存活的 2 个 tikv 并且在这 2 个 tikv 上补这种 3 个副本都丢了的 region，用空 region 补充这些 peer 副本。

```
   ./tikv-ctl --data-dir /data6/tikv-20180/ recreate-region -p 10.xxxxx:2379 -r 52
   ./tikv-ctl --data-dir /data6/tikv-20180/ recreate-region -p 10.xxxxx:2379 -r 46
```

注意：补空 region 时 -r 命令后不能带多个逗号分隔的 region id，只能一个 region 一个 region 的补，如果 region id 过多，可以考虑搞个脚本来跑。

(10)恢复 pd 调度配置

（11）重启 2 个 tikv，再次查看 region 情况，发现所有的 region 的多数副本都已经正常。

tiup ctl:v5.1.1 pd -u http://10.xxxxx:2379 region --jq='.regions[] | {id: .id, peer*stores: [.peers[].store*id] | select(length as $total | map(if .==(2,8,1) then . else empty end) | length>=$total-length)}'

(12) 登录查看数据，通过上面的第 5 步骤的 region 丢失来看查看，统计发现 sbtest5/sbtest6 表丢失了近 1 半的记录，其他数据表有完整数据的。

```
mysql> select count(1),count(c) from sbtest5;
+----------+----------+
| count(1) | count(c) |
+----------+----------+
|   280555 |   280555 |
+----------+----------+
1 row in set (0.35 sec)

mysql> select count(1),count(c) from sbtest6;
+----------+----------+
| count(1) | count(c) |
+----------+----------+
|   247312 |   247312 |
+----------+----------+
1 row in set (0.27 sec)

mysql> select count(1),count(c) from sbtest1;
+----------+----------+
| count(1) | count(c) |
+----------+----------+
|   500000 |   500000 |
+----------+----------+
1 row in set (0.38 sec)
```

目前集群状态：

![3tikv-ok.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/3tikv-ok-1647483461131.png)

## 总结和思考

### 总结

本篇文章主要讲了 tikv 节点宕机时的现象以及如何恢复的方案，tikv 3 副本的 raft group 能保证在宕机一台 KV 时不用 DBA 立刻介入的能力；在上面宕机 2 台 KV 时，因为根据 PD 的调度规则，一个 raft group 的 peer 肯定会调度到 3 个 KV 节点，所以 2 个 KV 宕机，肯定还有一个 peer 在，需要 DBA 介入，并且使用“快刀斩乱麻”的 tikv-ctl 尽快的恢复了集群；但是在集群宕机 3 台 KV 时就有大概率的数据丢失，这时候就需要考虑业务恢复重要还是数据保护重要了，另外在 3 个 kv 宕机的章节，我还重启了 2 次 tikv，其实如果定好了预案，清理 region 中故障 store 的 peer 跟 recreate 空 region 可以一起做，本次只是突出 region 丢失数据的严重性。

另外以上是基于 5 个 KV 的集群做的多次验证，每次都出了不少的“状况”，可以根据文章的大概处理流程自己模拟验证，其实我遇到一个“严重”的“状况”是：5 副本的 KV 当挂了 3 个时，可能一些 mysql 系统表(比如 user 权限表)的 region 也“丢失”了，导致无法进入到集群验证数据，后来通过：跟 mysql 类似的 skip-grant-table 才进入，如果用户权限都没有了，业务肯定都无法连接 tidb 了，这种情景就是要强调：在我没有 BR 备份的情况下，5 个节点(3kv 宕机)能给我恢复出 2 个 kv 数据的重要性了。

还有一个就是补完空 region，还遇到了一些诡异的“数据准确性”问题，比如 sbtest5 表的默认索引 k*5 索引被补了空 region 时，idx*k 是我重新建立的索引。通过 2 个索引的查询结果是不一样的，也就是说补 region 影响了数据的正确性，不过对于上面的集群多数 KV 不可用的情况下，还是建议新建集群然后将 2 个 KV 的数据恢复到新集群。

```
mysql> show create table sbtest5\G
*************************** 1. row ***************************
       Table: sbtest5
Create Table: CREATE TABLE `sbtest5` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `k` int(11) NOT NULL DEFAULT '0',
  `c` char(120) NOT NULL DEFAULT '',
  `pad` char(60) NOT NULL DEFAULT '',
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `k_5` (`k`),
  KEY `idx_k` (`k`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin AUTO_INCREMENT=633209
1 row in set (0.00 sec)

mysql> select * from sbtest5 use index(k_5) where k=249602;
ERROR 1105 (HY000): inconsistent index k_5 handle count 99 isn't equal to value count 66
mysql>
mysql> select count(1) from sbtest5 use index(idx_k) where k=249602;
+----------+
| count(1) |
+----------+
|       66 |
+----------+
1 row in set (0.00 sec)

mysql> select count(1) from sbtest5 use index(idx_k);
+----------+
| count(1) |
+----------+
|   280555 |
+----------+
1 row in set (0.20 sec)

mysql> select count(1) from sbtest5 use index(k_5);
+----------+
| count(1) |
+----------+
|   500000 |
+----------+
1 row in set (0.27 sec)
```

### 思考：

（1） 在集群多 tikv(>=3)不可用的时候，需要根据业务情况做好降级准备，最好在 sql 接入层（HAproxy/lvs）先把 vip 下线，避免新流量写入，毕竟后面 tikv-ctl 操作涉及到 tikv 所有节点的 shutdown。

（2）以上的测试都是基于默认的 3 副本来分析的，对于多 KV 的核心集群，其实可以设定 5 副本来增加集群的可用性。

（3）关闭 PD 调度和避免宕机 tikv 重启的重要性，避免元信息异常引发的 region 不可用

（4）tikv 真的不可以恢复后的补 region 的决定，需要根据实际情况来定，另外一定要看下补的 region 都是哪些业务的什么 table or index，注意观察下“修复”后数据的准确性。

（5）做好 TiDB 的备份，如果真的线上集群不可用，至少还有备份可以恢复，就看备份的频度（容忍丢失的数据量），一旦集群多数 KV 不可用，需要”2 条腿“走路，1 个方案是 BR 恢复备份到新集群，另外就是在原有集群进行 tikv-ctl 的恢复。

（6）“多活”方案的重要性，比如基于 ticdc 的主备同城双机房，备机房可以做一些准实时的读请求(读写分离)；另外就是 tidb 5.4 版本提供的同城双中心自适应同步模式；其他同城 3 中心或者异地 3 中心的方案可以参考官方文档。

（7）同一个集群同时 3 个 tikv 宕机的概率还是比较低的，除非就是部署时没有考虑机架或者交换机部署，由于机架掉电或者交换机故障导致的多 KV 的不可用，这是就要看业务是否能扛或者 IDC 换件的应急速度了。
