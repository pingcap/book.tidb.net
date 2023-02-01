---
title: DR Auto-Sync 搭建和灾难恢复手册 - TiDB 社区技术月刊
sidebar_label: DR Auto-Sync 搭建和灾难恢复手册
hide_title: true
description: DR Auto-Sync 是一种跨同城两中心（网络延迟<1.5ms，带宽>10Gbps）部署的单一集群方案，即两个数据中心只部署一个 TiDB 集群，两中心间的数据复制通过集群自身 Raft 机制完成。两中心可同时对外进行读写服务，任一中心发生故障不影响数据一致性。本文将为分享其搭建和灾难恢复处理。
keywords: [TiDB, DR Auto-Sync, 搭建, 灾难恢复]
---

# DR Auto-Sync 搭建和灾难恢复手册

> 作者：[Gin](https://tidb.net/u/Gin/answer)

## DR Auto-Sync 用户手册索引

- [专栏 - 同城双中心自适应同步方案 —— DR Auto-Sync 详解 | TiDB 社区](https://tidb.net/blog/061045ad)
- [专栏 - DR Auto-Sync 搭建和计划内切换操作手册 | TiDB 社区](https://tidb.net/blog/bc7aa3d9)
- [专栏 - DR Auto-Sync 的 ACID 恢复功能简介和长期断网应急处理方案 | TiDB 社区](https://tidb.net/blog/4efb5391)

## 一、版本选择及方案限制

### 1.1 版本选择

请在 6.1.0 或更高版本上使用 DR Auto-Sync 功能。

## 二、前言

DR Auto-Sync 是一种跨同城两中心（网络延迟<1.5ms，带宽>10Gbps）部署的单一集群方案，即两个数据中心只部署一个 TiDB 集群，两中心间的数据复制通过集群自身 Raft 机制完成。两中心可同时对外进行读写服务，任一中心发生故障不影响数据一致性。

![662d89da14bf34fba12895bc4ad6e9e4739229c2 (1).png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/662d89da14bf34fba12895bc4ad6e9e4739229c2(1)-1675136022861.png)

## 三、部署 TiDB 集群

### 3.1 集群部署拓扑

DR Auto-Sync 双活模式部署拓扑如下（示例），需要开启 TiDB 的两个特殊功能：

- Placement-Rules，用以设定每个 TiKV 的角色
  Voter - 该 TiKV 上的 replica 可投票、可被选为 leader
  Follower - 该 TiKV 上的 replica 可投票，不可被选为 leader
  Learner - 该 TiKV 上的 replica 只异步接收日志，不参与投票
- DR Auto-Sync，用以开启两中心自适应同步复制功能

![5387a5a60696a8e950b8b3911e198e178e3b035f\_2\_903x438.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/5387a5a60696a8e950b8b3911e198e178e3b035f_2_903x438-1675136052270.png)

图 2 样例拓扑

| 192.168.239.69 | 192.168.239.70 | 192.168.239.71 | 192.168.239.72 |
| -------------- | -------------- | -------------- | -------------- |
| tidb           | tidb           | tidb           | tidb           |
| 2\*tikv        | 2\*tikv        | 2\*tikv        | 2\*tikv        |
| pd             | pd             |                | pd             |
| tiup           |                | tiup           |                |
| tiup ctl       |                | tiup ctl       |                |
| tiup cluster   |                | tiup cluster   |                |
| prometheus     |                | prometheus     |                |
| alertmgr       |                | alertmgr       |                |
| grafana        |                | grafana        |                |
| jq             |                | jq             |                |
| 对集群所有节点的免密 ssh |                | 对集群所有节点的免密 ssh |                |
|                |                | pd-recover     |                |

注意：包含 ctl 组件在内，集群所有组件的版本都不应低于 v6.1.0

## 3.2 TiKV Label 设计

Placement-Rules 与 DR Auto-Sync 都需要在配置好 Label 的集群上运行。本案例采用双中心 3 Voter 副本 + 1 Learner 副本，共 8 个 TiKV 实例部署，Label 设计如图：

![86464841e456f2dd8912dd1d6cb3028e1a6cbe90\_2\_903x418.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/86464841e456f2dd8912dd1d6cb3028e1a6cbe90_2_903x418-1675136158445.png)

图 3

Label 原理和规划请参考专栏文章： [专栏 - TiDB 集群的可用性详解及 TiKV Label 规划 | TiDB 社区](https://tidb.net/blog/8f2a6d62)

## 3.3 拓扑文件示例

```
global:
  user: tidb
  ssh_port: 22
  deploy_dir: /deploy/sa_cluster_1
  data_dir: /data1/sa_cluster_1/
  os: linux
  arch: amd64
monitored:
  node_exporter_port: 39100
  blackbox_exporter_port: 39115
  deploy_dir: /deploy/sa_cluster_1/monitor-39100
  data_dir: /data1/sa_cluster_1/monitor_data
  log_dir: /deploy/sa_cluster_1/monitor-39100/log
server_configs:
  tidb:
    oom-use-tmp-storage: true
    performance.max-procs: 0
    performance.txn-total-size-limit: 2147483648
    prepared-plan-cache.enabled: true
    tikv-client.copr-cache.capacity-mb: 10240.0
    tikv-client.max-batch-wait-time: 0
    tmp-storage-path: /data1/sa_cluster_1/tmp_oom
    split-table: true
  tikv:
    coprocessor.split-region-on-table: true
    readpool.coprocessor.use-unified-pool: true
    readpool.storage.use-unified-pool: false
    server.grpc-compression-type: none
    storage.block-cache.shared: true
  pd:
    enable-cross-table-merge: false
    replication.enable-placement-rules: true
    schedule.leader-schedule-limit: 4
    schedule.region-schedule-limit: 2048
    schedule.replica-schedule-limit: 64
    replication.location-labels: ["dc","logic","rack","host"]
  tiflash: {}
  tiflash-learner: {}
  pump: {}
  drainer: {}
  cdc: {}
tidb_servers:
- host: 192.168.239.69
  ssh_port: 22
  port: 4000
  status_port: 10080
  deploy_dir: /deploy/sa_cluster_1/tidb-4000
- host: 192.168.239.70
  ssh_port: 22
  port: 4000
  status_port: 10080
  deploy_dir: /deploy/sa_cluster_1/tidb-4000
- host: 192.168.239.71
  ssh_port: 22
  port: 4000
  status_port: 10080
  deploy_dir: /deploy/sa_cluster_1/tidb-4000
- host: 192.168.239.72
  ssh_port: 22
  port: 4000
  status_port: 10080
  deploy_dir: /deploy/sa_cluster_1/tidb-4000
tikv_servers:
- host: 192.168.239.69
  ssh_port: 22
  port: 20160
  status_port: 20180
  deploy_dir: /deploy/sa_cluster_1/tikv-20160
  data_dir: /data1/sa_cluster_1/tikv_data
  config:
    server.labels: { dc: "dc1",logic: "logic1",rack: "r1",host: "192_168_239_69" }
- host: 192.168.239.69
  ssh_port: 22
  port: 20161
  status_port: 20181
  deploy_dir: /deploy/sa_cluster_1/tikv-20161
  data_dir: /data2/sa_cluster_1/tikv_data
  config:
    server.labels: { dc: "dc1",logic: "logic1",rack: "r1",host: "192_168_239_69" }
- host: 192.168.239.70
  ssh_port: 22
  port: 20160
  status_port: 20180
  deploy_dir: /deploy/sa_cluster_1/tikv-20160
  data_dir: /data1/sa_cluster_1/tikv_data
  config:
    server.labels: { dc: "dc1",logic: "logic2",rack: "r1",host: "192_168_239_70" }
- host: 192.168.239.70
  ssh_port: 22
  port: 20161
  status_port: 20181
  deploy_dir: /deploy/sa_cluster_1/tikv-20161
  data_dir: /data2/sa_cluster_1/tikv_data
  config:
    server.labels: { dc: "dc1",logic: "logic2",rack: "r1",host: "192_168_239_70" }
- host: 192.168.239.71
  ssh_port: 22
  port: 20160
  status_port: 20180
  deploy_dir: /deploy/sa_cluster_1/tikv-20160
  data_dir: /data1/sa_cluster_1/tikv_data
  config:
    server.labels: { dc: "dc2",logic: "logic3",rack: "r1",host: "192_168_239_71" }
- host: 192.168.239.71
  ssh_port: 22
  port: 20161
  status_port: 20181
  deploy_dir: /deploy/sa_cluster_1/tikv-20161
  data_dir: /data2/sa_cluster_1/tikv_data
  config:
    server.labels: { dc: "dc2",logic: "logic3",rack: "r1",host: "192_168_239_71" }
- host: 192.168.239.72
  ssh_port: 22
  port: 20160
  status_port: 20180
  deploy_dir: /deploy/sa_cluster_1/tikv-20160
  data_dir: /data1/sa_cluster_1/tikv_data
  config:
    server.labels: { dc: "dc2",logic: "logic4",rack: "r1",host: "192_168_239_72" }
- host: 192.168.239.72
  ssh_port: 22
  port: 20161
  status_port: 20181
  deploy_dir: /deploy/sa_cluster_1/tikv-20161
  data_dir: /data2/sa_cluster_1/tikv_data
  config:
    server.labels: { dc: "dc2",logic: "logic4",rack: "r1",host: "192_168_239_72" }
pd_servers:
- host: 192.168.239.69
  ssh_port: 22
  name: pd-192.168.239.69-2379
  client_port: 2379
  peer_port: 2380
  deploy_dir: /deploy/sa_cluster_1/pd-2379
  data_dir: /data1/sa_cluster_1/pd_data
- host: 192.168.239.70
  ssh_port: 22
  name: pd-192.168.239.70-2379
  client_port: 2379
  peer_port: 2380
  deploy_dir: /deploy/sa_cluster_1/pd-2379
  data_dir: /data1/sa_cluster_1/pd_data
- host: 192.168.239.72
  ssh_port: 22
  name: pd-192.168.239.72-2379
  client_port: 2379
  peer_port: 2380
  deploy_dir: /deploy/sa_cluster_1/pd-2379
  data_dir: /data1/sa_cluster_1/pd_data
monitoring_servers:
- host: 192.168.239.69
  ssh_port: 22
  port: 10090
  deploy_dir: /deploy/sa_cluster_1/prometheus-10090
  data_dir: /data1/sa_cluster_1/prometheus_data
- host: 192.168.239.71
  ssh_port: 22
  port: 10090
  deploy_dir: /deploy/sa_cluster_1/prometheus-10090
  data_dir: /data1/sa_cluster_1/prometheus_data
grafana_servers:
- host: 192.168.239.69
  ssh_port: 22
  port: 3000
  deploy_dir: /deploy/sa_cluster_1/grafana-3000
- host: 192.168.239.71
  ssh_port: 22
  port: 3000
  deploy_dir: /deploy/sa_cluster_1/grafana-3000
```

## 3.4 备份关键配置

1）集群部署完成后，复制源文件到两个同城容灾中心的 tiup 上

`scp -r .tiup/storage/cluster/clusters/sa1 192.168.239.71:/home/tidb/.tiup/storage/cluster/clusters/`

2）并在两个 tiup 上分别验证是否生效

`tiup cluster display sa1`

3）在两个中心的服务器上保留原始拓扑文件的备份

### 3.5 监控组件调整

两个 grafana 在启动后会都连接到第一个 Prometheus 上，须手工为两个 grafana 增加增加缺失的容灾中心 Prometheus 数据源。

## 四、配置 Placement-Rules 并启用 DR Auto-Sync 功能

### 4.1 使用 jq 查看 TiKV 和 region 关键信息

- 查看 store 基本信息
  `store --jq=".stores[] | {id: .store.id, address: .store.address, state_name: .store.state_name, capacity: .status.capacity, available: .status.available, region_count: .status.region_count}"`

- 列出所有 region
  `region --jq=".regions[] | {id:.id}"`

- 检查没有 learner peer 的 region
  `region --jq='.regions[] | select(.peers | any(.role_name=="Learner") | not) | {id: .id, peers: [.peers]}'`

### 4.2 配置 Placement Rules

1）在集搭建后，导入初始数据之前，完成 DR Auto-Sync 的相关配置

`config placement-rules rule-bundle save --in="/home/tidb/topology/rules.json"`

rules.json 文件内容：

```
[
  {
    "group_id": "pd",
    "group_index": 0,
    "group_override": false,
    "rules": [
      {
        "group_id": "pd",
        "id": "logic1",
        "start_key": "",
        "end_key": "",
        "role": "voter",
        "count": 1,
        "location_labels": ["dc", "logic", "rack", "host"],
        "label_constraints": [{"key": "logic", "op": "in", "values": ["logic1"]}]
      },
      {
        "group_id": "pd",
        "id": "logic2",
        "start_key": "",
        "end_key": "",
        "role": "voter",
        "count": 1,
        "location_labels": ["dc", "logic", "rack", "host"],
        "label_constraints": [{"key": "logic", "op": "in", "values": ["logic2"]}]
      },
      {
        "group_id": "pd",
        "id": "logic3",
        "start_key": "",
        "end_key": "",
        "role": "voter",
        "count": 1,
        "location_labels": ["dc", "logic", "rack", "host"],
        "label_constraints": [{"key": "logic", "op": "in", "values": ["logic3"]}]
      },
      {
        "group_id": "pd",
        "id": "logic4",
        "start_key": "",
        "end_key": "",
        "role": "learner",
        "count": 1,
        "location_labels": ["dc", "logic", "rack", "host"],
        "label_constraints": [{"key": "logic", "op": "in", "values": ["logic4"]}]
      }
    ]
  }
]
```

2）检查配置是否加载

`config placement-rules show`

3）检查没有 learner peer 的 region

`region --jq='.regions[] | select(.peers | any(.role_name=="Learner") | not) | {id: .id, peers: [.peers]}'`

4）如过存在尚未转换的 learner peer，参考该命令促进 voter 到 learner 角色的转换（示例）

`operator add remove-peer 6066 6`

第一个数字为 region id，第二个数字为 store id

### 4.3 配置 DR Auto-Sync

1）增加 DR Auto-Sync 配置

```
config set replication-mode dr-auto-sync
config set replication-mode dr-auto-sync label-key dc
config set replication-mode dr-auto-sync primary dc1
config set replication-mode dr-auto-sync dr dc2
config set replication-mode dr-auto-sync primary-replicas 2
config set replication-mode dr-auto-sync dr-replicas 1
config set replication-mode dr-auto-sync pause-region-split true 开启 ACID 恢复功能（可选）
```

2）检查配置是否生效

`config show replication-mode`

## 五、灾难前的准备工作

注意，灾难发生后将难以收集恢复集群所需要的信息！

因此，灾难前的准备工作需要在完成前四章的部署后，以及集群拓扑改变（如，扩容、缩容、迁移、端口号变更等）后，按本章内容操作，做到有备无患，降低 RTO。

### 5.1 制作 TiUP 的灾难恢复 meta.yaml 文件

1）集群部署完成后，复制元文件到两个同城容灾中心的 tiup 上

`scp -r .tiup/storage/cluster/clusters/sa1 192.168.239.71:/home/tidb/.tiup/storage/cluster/clusters/`

2）在容灾中心的 tiup 上验证是否生效

tiup cluster display sa1

![7bc2078c438d448227270e39045ead80a3ef1278\_2\_903x204.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/7bc2078c438d448227270e39045ead80a3ef1278_2_903x204-1675136214544.png)

图 4. 集群完整拓扑

3）就地备份容灾中心 tiup 管理的集群元信息文件
`cp ~/.tiup/storage/cluster/clusters/sa1/meta.yaml ~/.tiup/storage/cluster/clusters/sa1/meta_full.yaml`

4）制作集群的灾难恢复 meta.yaml 文件

编辑该文件，移除含有主中心 ip 的的各组件实例

> \~/.tiup/storage/cluster/clusters/sa1/meta.yaml

5）检查灾备组件拓扑，确认所有主中心组件都不予显示，且包含了容灾中心的全部组件
`tiup cluster display sa1`

![1ad6d1d7fcc016812748382b9779e16b1ba4ff1b\_2\_903x112.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/1ad6d1d7fcc016812748382b9779e16b1ba4ff1b_2_903x112-1675136234802.png)

图 5. 灾难恢复组件拓扑

### 5.2 收集并记录集群信息

1）通过 pd-ctl 查看 cluster id 并记录，当所有 PD 都无法恢复的时候可以使用该信息重建 PD

cluster

2）通过 pd-ctl 查看 store 基本信息并记录
`store --jq=".stores[] | {id: .store.id, address: .store.address, state_name: .store.state_name, capacity: .status.capacity, available: .status.available, region_count: .status.region_count}"`

### 5.3 部署 pd-recover

恢复数据时将使用 pd-recover 修改 PD 元信息，将其 allocate id 强制提升 100000000，以避免 allocate id 回退。

1）参照[官方文档](https://docs.pingcap.com/zh/tidb/stable/pd-recover#pd-recover-%E4%BD%BF%E7%94%A8%E6%96%87%E6%A1%A3)，下载 v6.1.0 版本以上的 pd-recover

`wget https://download.pingcap.org/tidb-v6.1.0-linux-amd64.tar.gz`

2）将 pd-recover 部署在容灾中心 tiup 所在服务器，并记录存放路径

### 5.4 准备灾难恢复脚本 —— 基于 pd-ctl 的在线恢复（v6.1.0+ 适用）

1）脚本需要的输入

1. tiup 中记录的集群名称，对应脚本中 CLUSTER\_NAME 变量
2. 在第 5.2 章节收集的信息中，筛选出主中心（即发生灾难的中心，这些宕机的 TiKV 将被移除）所有 TiKV 的 store id，对应脚本中 STORE\_ID 变量
3. tiup ctl 版本，对应脚本中 CTL\_VERSION 变量
4. 5.3 章节中部署的 pd-recover 存放路径，对应脚本中 PD\_RECOVER\_DIR 变量
5. 根据实际 label 修改脚本第 40-60 行，将 placement-rules 调整为容灾中心的所有 TiKV 实例承载 2 个可投票副本

![图片1.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/图片1-1675136444317.png)

图 6. 将 Learner 转为 Voter 的 Placement-Rules 配置样例

2）灾难恢复脚本（样例）disaster\_recovery.sh
\#/!bin/bash
source \~/.bash\_profile

```
#========== parameter ==============
CLUSTER_NAME=sa1
# unhealthy store_id list
STORE_ID="1,3,14,16"
CTL_VERSION=v6.1.0
PD_RECOVER_DIR=/home/tidb/tidb-community-toolkit-v6.1.0-linux-amd64/

#tikv-servers information 
TIKV_IP_DATA_LIST=`tiup cluster display ${CLUSTER_NAME} -R tikv|grep tikv |grep -v tiup|awk '{print $3","$7}'|xargs`
#pd connection information
PD_CONN=`tiup cluster display ${CLUSTER_NAME} |grep pd|grep -v tiup|awk '{print $1}'`
#pd deploy dir
PD_DEPLOY_DIR=`tiup cluster display ${CLUSTER_NAME} |grep pd|grep -v tiup|awk '{print $8}'`


if [ 'x'${STORE_ID} == 'x' ]
then 
	echo " usage : sh disaster_recover.sh  primary_store_id[,primary_store_id][,.....]"
	exit 1
fi


#stop cluster 
tiup cluster stop ${CLUSTER_NAME} --yes


echo "=====================================================Disaster Recovery begins======================================================================="
echo " ------------------------------------------------- 1. force-new-cluster ------------------------------------------------"
tiup cluster exec ${CLUSTER_NAME} -R pd --command "sed -i '/pd-server/ s#pd-server#pd-server --force-new-cluster#' ${PD_DEPLOY_DIR}/scripts/run_pd.sh"

#start pd 
tiup cluster start ${CLUSTER_NAME} -N ${PD_CONN}
tiup cluster start ${CLUSTER_NAME} -R tikv

echo " ------------------------------------------------- 2. update the placement-rules -----------------------------------------------"
#generate the new rule's json
cat > rules_dr.json <<EOF
[
  {
    "group_id": "pd",
    "group_index": 0,
    "group_override": false,
    "rules": [
      {
        "group_id": "pd",
        "id": "dc1",
        "start_key": "",
        "end_key": "",
        "role": "voter",
        "count": 2,
        "location_labels": ["dc", "logic", "rack", "host"],
        "label_constraints": [{"key": "dc", "op": "in", "values": ["dc2"]}]
      }
    ]
  }
]
EOF

#update the placement-rules
tiup ctl:${CTL_VERSION} pd -u http://${PD_CONN} config placement-rules rule-bundle save --in="rules_dr.json"

#disable dr auto-sync
tiup ctl:${CTL_VERSION} pd -u http://${PD_CONN} config set replication-mode majority

echo " ------------------------------------------------- 3. remove all unhealthy tikv stores from cluster ------------------------------------------------"
echo "remove unhealthy stores : "${STORE_ID}
tiup ctl:${CTL_VERSION} pd -u http://${PD_CONN} unsafe remove-failed-stores ${STORE_ID}

while true
do
    status=`tiup ctl:${CTL_VERSION} pd -u http://${PD_CONN} unsafe remove-failed-stores show |grep 'Unsafe recovery finished' |wc -l`
    if [ $status -eq 1 ]
        then
            break
    fi
done

tiup ctl:${CTL_VERSION} pd -u http://${PD_CONN} unsafe remove-failed-stores show >> /tmp/unsafe_remove_failed_stores.log

echo "remove finished, please check the log(/tmp/unsafe_remove_failed_stores.log) for more detail."


echo " ------------------------------------------------- 4. recover pd server -----------------------------------------------"
#allocate-id +100000000 
${PD_RECOVER_DIR}/pd-recover --from-old-member --endpoints=http://${PD_CONN}

tiup cluster restart ${CLUSTER_NAME} -N ${PD_CONN} --yes


echo " ------------------------------------------------- 5. reload cluster -----------------------------------------------"
# restart cluster 
tiup cluster restart ${CLUSTER_NAME} --yes


echo "=====================================================Disaster Recovery finished======================================================================="
```

3）灾难恢复脚本处理流程说明

1. 强制恢复单副本 PD（两中心按 3:2 部署了 5 个 PD 的场景，可以任选其中一个 PD 进行恢复，容灾中心另一个 PD 将被弃用）
2. 调整 Placement-Rules 将 Learner 副本转为 Voter，即恢复后的集群为 2 副本模式
3. 关闭 DR Auto-Sync 功能，转为默认的 Majority 模式
4. 使用 pd-ctl 在线清除主中心所有 TiKV
5. 使用 pd-recover 使 PD allocate-id +100000000，确保后续分配的 region id 等不会发生回退

### 5.6 灾难恢复演练

编写好灾难恢复脚本后，用户需要在准生产环境上做充分的演练，以确保：

- 脚本被放置于容灾中心 tiup 所在用户路径下；
- 脚本能准确的执行，一旦灾难发生无需调整任何参数，可直接运行；
- 记录脚本的执行时间，为整个业务的灾难恢复手册以及 RTO 的计算提供重要输入。

## 六、启用灾难恢复方案的必要条件

1. 集群由于主中心数据节点全部或部分宕机，导致集群无法提供完整的数据服务，且经人工确认无法在短时间内恢复的；
2. 灾难恢复脚本运行期间主中心与容灾中心的网络保持断开状态，避免突然连通的主中心组件对灾难恢复造成干扰。可以通过调整路由表等网络运维手段实现。

## 七、灾难恢复

进入灾难恢复阶段，首先需要通过容灾中心 PD 的 Data Dir 路径中存储的 DR\_STATE 文件来确认双中心网络断开前的复制状态：
cat /data1/sa\_cluster\_1/pd\_data/DR\_STATE
{"state":"sync","state\_id":2158}

根据双中心网络断开前的复制状态的不同，灾难恢复分为两种情况：

- 宕机前的复制状态为 sync 或 async
  - 使用准备好的灾难恢复脚本进行数据恢复。这种情况恢复的数据是具备 ACID 一致性，可以直接让集群提供服务。
  - RPO 需要通过双中心全局状况来判断。
- 宕机前的复制状为 sync\_recover
  - 确保 pause-region-split 自上一次 sync 状态后从未被关闭过，否则 DR 副本不具备 ACID 恢复能力。
  - 使用准备好的灾难恢复脚本进行数据恢复。
  - 通过灾难恢复脚本恢复后，还需要进行 ACID 恢复才能将数据调整至 ACID 一致性的状态，确保数据具备一致性后，方可让集群提供服务。
  - RPO 需要通过双中心全局状况来判断。

## 八、灾难恢复的后续处理

### 8.1 及时扩容集群至 3 副本状态

灾难恢复后的集群为 2 副本模式，需要及时扩充服务器（来自于生产备用区）并将集群扩容至 3 副本模式以恢复集群的容灾能力。

### 8.2 主中心恢复后的操作

1）若故障前的数据还在，需要将主中心的组件全部移除。可以参考第 5.1 章节，编辑主中心 tiup 的 meta 文件进行残余组件移除。
2）将主中心的服务器通过扩容的方式加入到灾难恢复后的集群中。
3）等待数据重平衡完成，将 7.1 扩容的临时服务器缩容掉。
4）参考第四章内容将集群调整回 DR Auto-Sync 模式。

以上操作，除TiDB 组件的缩容之外，都可以在线进行。

## 九、附录

### 9.1 关闭 DR Auto-Sync 功能的命令

`config set replication-mode majority`

### 9.2 通过 PD http api 确认复制状态的命令

curl <http://127.0.0.1:2379/pd/api/v1/replication_mode/status>
