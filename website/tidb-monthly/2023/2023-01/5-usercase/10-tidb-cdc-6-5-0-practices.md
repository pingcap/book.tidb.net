---
title: TiDB CDC v6.5.0 新特性实践 - TiDB 社区技术月刊
sidebar_label: TiDB CDC v6.5.0 新特性实践
hide_title: true
description: 本文依托部署在 K8s 中的 TiDB ，测试 CDC 的新特性，OSS 采用 MinIO。
keywords: [TiDB, K8s, CDC, 新特性, 实践]
---

# TiDB CDC v6.5.0 新特性实践

> 作者：[数据小黑](https://tidb.net/u/%E6%95%B0%E6%8D%AE%E5%B0%8F%E9%BB%91/answer)

## 背景

在最近的 v6.5.0 发布的新特性中（详见：[release-6.5.0](https://docs.pingcap.com/zh/tidb/stable/release-6.5.0)），我对一个特性特别感兴趣：
从 v6.5.0 开始，TiCDC 支持将行变更事件保存至存储服务，如 Amazon S3、Azure Blob Storage 和 NFS。参考：[使用指南](https://docs.pingcap.com/zh/tidb/stable/ticdc-sink-to-cloud-storage)
简言之，这个特性能够通过 TiCDC 这一个组件，就能保存 CDC 日志到对象存储中。如果应用这个特性，我就没有必要部署 Kafka 集群了，简化了部署要求，降低了部署成本。
本文依托部署在 K8s 中的 TiDB ，测试 CDC 的新特性，OSS 采用 MinIO。

## 环境准备

TiDB 在 k8s 上的部署详见：[快速上手 TiDB Operator](https://docs.pingcap.com/zh/tidb-in-kubernetes/stable/get-started)，部署个测试集群即可，官方文档已经很详细了，可以参考我的 tidb-cluster.yml 如下：

```
# IT IS NOT SUITABLE FOR PRODUCTION USE.
# This YAML describes a basic TiDB cluster with minimum resource requirements,
# which should be able to run in any Kubernetes cluster with storage support.
apiVersion: pingcap.com/v1alpha1
kind: TidbCluster
metadata:
  name: basic
spec:
  version: v6.5.0
  timezone: UTC
  pvReclaimPolicy: Retain
  enableDynamicConfiguration: true
  configUpdateStrategy: RollingUpdate
  discovery: {}
  helper:
    image: alpine:3.16.0
  pd:
    baseImage: uhub.service.ucloud.cn/pingcap/pd
    maxFailoverCount: 0
    replicas: 3
    # if storageClassName is not set, the default Storage Class of the Kubernetes cluster will be used
    # storageClassName: local-storage
    requests:
      storage: "1Gi"
    config: {}
  tikv:
    baseImage: uhub.service.ucloud.cn/pingcap/tikv
    maxFailoverCount: 0
    # If only 1 TiKV is deployed, the TiKV region leader 
    # cannot be transferred during upgrade, so we have
    # to configure a short timeout
    evictLeaderTimeout: 1m
    replicas: 3
    # if storageClassName is not set, the default Storage Class of the Kubernetes cluster will be used
    # storageClassName: local-storage
    requests:
      storage: "1Gi"
    config:
      storage:
        # In basic examples, we set this to avoid using too much storage.
        reserve-space: "0MB"
      rocksdb:
        # In basic examples, we set this to avoid the following error in some Kubernetes clusters:
        # "the maximum number of open file descriptors is too small, got 1024, expect greater or equal to 82920"
        max-open-files: 256
      raftdb:
        max-open-files: 256
  tidb:
    baseImage: uhub.service.ucloud.cn/pingcap/tidb
    maxFailoverCount: 0
    replicas: 1
    service:
      type: ClusterIP
    config: {}
  ticdc:
    baseImage: uhub.service.ucloud.cn/pingcap/ticdc
    replicas: 3
    config:
      logLevel: info

```

部署后集群状态如下：
![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1674007320655.png)
部署过程中，有点小波折，[关于 6.5.0 版本中 TiDB-Dashboard 依赖包版本太高的问题](https://asktug.com/t/topic/999530)，我最终采用了社区大佬的镜像，替换了官方镜像完成了部署。
替换步骤为，修改官方的 tidb-dashboard.yml：

```
apiVersion: pingcap.com/v1alpha1
kind: TidbDashboard
metadata:
  name: basic
spec:
  baseImage: sabaping/tidb-dashboard:v6.5.0
  version: v6.5.0

  clusters:
    - name: basic

  requests:
    storage: 10Gi
```

修改完成后，执行：

```
kubectl apply -f tidb-dashboard.yml -n tidb-cluster
```

即可完成更新。

MinIO 的在 k8s 上的部署详见：[kubernetes 部署 minio 对象存储](https://blog.csdn.net/networken/article/details/111469223)

## 配置 CDC 任务

官方参考文档：<https://docs.pingcap.com/zh/tidb/stable/ticdc-sink-to-cloud-storage>
我的目前是配置 TiCDC，同步 TiDB 的数据到同一个 k8s 集群的 MinIO 中，我配置中的地址都采用了 Service 地址。
我的配置如下：

```
./cdc cli changefeed create \
    --server=http://basic-ticdc-peer:8301 \
    --sink-uri="s3://tidbbinlog/?protocol=canal-json&endpoint=http://minio-headless.minio:9000&access-key=XXX&secret-access-key=XXX&force-path-style=true" \
    --changefeed-id="oss-replication-task"
```

各参数说明：

- server=<http://basic-ticdc-peer:8301>
  ticdc 的服务地址
- sink-uri=...
  目标对象存储的配置
- s3://tidbbinlog/
  TiCDC 支持的对象存储包含 s3 协议，MinIO 支持 s3 协议，此处采用 s3 协议，tidbbinlog 为 bucket 名称
- protocol=canal-json
  存储到对象存储中内容的格式，v6.5.0 支持 CSV 和 Canal-JSON 格式，我惯用 canal-json
- endpoint=<http://minio-headless.minio:9000>
  对象存储访问地址
- access-key=XXX
  对象存储访问 access-key
- secret-access-key=XXX
  对象存储访问 secret-access-key
- force-path-style=true
  采用路径访问的方式访问对象存储，访问 MinIO 必须设置
- changefeed-id="oss-replication-task"
  CDC 的任务 ID

在命令行执行：

```
kubectl exec basic-ticdc-0 -it -n tidb-cluster -- /bin/bash
```

进入 pod 的命令行窗口，执行命令:

```
./cdc cli changefeed create \
    --server=http://basic-ticdc-peer:8301 \
    --sink-uri="s3://tidbbinlog/?protocol=canal-json&endpoint=http://minio-headless.minio:9000&access-key=XXX&secret-access-key=XXX&force-path-style=true" \
    --changefeed-id="oss-replication-task"
```

返回信息如下：

```
Create changefeed successfully!
ID: oss-replication-task
Info: {"upstream_id":7184751775799892803,"namespace":"default","id":"oss-replication-task","sink_uri":...}
```

此时查询任务状态：

```
./cdc cli changefeed list --server=http://basic-ticdc-peer:8301
[
  {
    "id": "oss-replication-task",
    "namespace": "default",
    "summary": {
      "state": "normal",
      "tso": 438588139028348953,
      "checkpoint": "2023-01-07 08:42:54.687",
      "error": null
    }
  }
]
```

MinIO 上可以看到在对应的 bucket 下已经创建了一个文件：
![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1674007360714.png)
文件内容为：

```
{"checkpoint-ts":438588195559702535}
```

438588195559702535 为同步数据的 commit-ts，438588195559702535 之前的数据都已经同步到了 MinIO。

## 测试数据变更

### 测试非分区表

在 TiDB 中建表和插入数据：

```
CREATE TABLE test.student (id varchar(20) NULL,
    name varchar(20) NULL,
    age varchar(100) NULL,
    `desc` varchar(100) NULL
);
INSERT INTO test.student (id,name,age,`desc`)
    VALUES ('1','zhangsan','18','好学生');
INSERT INTO test.student (id,name,age,`desc`)
    VALUES ('2','lisi','19','也是个好学生');
 INSERT INTO test.student (id,name,age,`desc`)
    VALUES ('3','wangwu','19','更是个好学生');
```

检查 MinIO 并没有新的目录和文件产生，经检查日志:

```
2023-01-07T08:49:18.857903341Z [2023/01/07 08:49:18.857 +00:00] [WARN] [snapshot.go:849] ["this table is ineligible to replicate"] [tableName=student] [tableID=82]
```

查找原因是因为 test.student 表没有主键，建主键，并插入数据：

```
ALTER TABLE test.student ADD CONSTRAINT student_PK PRIMARY KEY (id);
INSERT INTO test.student (id,name,age,`desc`)
    VALUES ('21','zhangsan','18','好学生');
INSERT INTO test.student (id,name,age,`desc`)
    VALUES ('22','lisi','19','也是个好学生');
 INSERT INTO test.student (id,name,age,`desc`)
    VALUES ('23','wangwu','19','更是个好学生');
```

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1674007371532.png)
其中，CDC000001.json：

```
{"id":0,"database":"test","table":"student","pkNames":["id"],"isDdl":false,"type":"INSERT","es":1673227668037,"ts":1673227668465,"sql":"","sqlType":{"id":12,"name":12,"age":12,"desc":12},"mysqlType":{"id":"varchar","name":"varchar","age":"varchar","desc":"varchar"},"old":null,"data":[{"id":"21","name":"zhangsan","age":"18","desc":" 好学生 "}]}
{"id":0,"database":"test","table":"student","pkNames":["id"],"isDdl":false,"type":"INSERT","es":1673227669537,"ts":1673227670111,"sql":"","sqlType":{"id":12,"name":12,"age":12,"desc":12},"mysqlType":{"id":"varchar","name":"varchar","age":"varchar","desc":"varchar"},"old":null,"data":[{"id":"22","name":"lisi","age":"19","desc":" 也是个好学生 "}]}
{"id":0,"database":"test","table":"student","pkNames":["id"],"isDdl":false,"type":"INSERT","es":1673227670787,"ts":1673227671141,"sql":"","sqlType":{"id":12,"name":12,"age":12,"desc":12},"mysqlType":{"id":"varchar","name":"varchar","age":"varchar","desc":"varchar"},"old":null,"data":[{"id":"23","name":"wangwu","age":"19","desc":" 更是个好学生 "}]}

```

schema.json：

```
{
    "Table": "student",
    "Schema": "test",
    "Version": 1,
    "TableVersion": 438626581528444931,
    "Query": "","Type": 0,"TableColumns": [
        {
            "ColumnName": "id",
            "ColumnType": "VARCHAR",
            "ColumnPrecision": "20",
            "ColumnNullable": "false",
            "ColumnIsPk": "true"
        },
        {
            "ColumnName": "name",
            "ColumnType": "VARCHAR",
            "ColumnPrecision": "20"
        },
        {
            "ColumnName": "age",
            "ColumnType": "VARCHAR",
            "ColumnPrecision": "100"
        },
        {
            "ColumnName": "desc",
            "ColumnType": "VARCHAR",
            "ColumnPrecision": "100"
        }
    ],
    "TableColumnsTotal": 4
}
```

详细的内容解释，官方有文档说明，在此不再赘述。
为表增加字段：

```
ALTER TABLE test.student ADD graduation CHAR(1) NULL;
```

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1674007385486.png)
test/student 下面增加了一个目录，根据官方说明，这一层是表的版本，也就是说，如果对表执行 ddl，此处就会增加一个目录。

### 测试分区表

分区表建表并插入数据：

```
CREATE TABLE `student_partition` (
  `id` INT NOT NULL,
  `name` varchar(20) DEFAULT NULL,
  `age` varchar(100) DEFAULT NULL,
  `desc` varchar(100) DEFAULT NULL,
  `graduation` char(1) DEFAULT NULL,
  PRIMARY KEY (`id`) 
)PARTITION BY HASH(id)
PARTITIONS 6;
INSERT INTO test.student_partition (id,name,age,`desc`)
    VALUES ('21','zhangsan','18','好学生');
INSERT INTO test.student_partition (id,name,age,`desc`)
    VALUES ('22','lisi','19','也是个好学生');
 INSERT INTO test.student_partition (id,name,age,`desc`)
    VALUES ('23','wangwu','19','更是个好学生');
```

查看对象存储：
![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1674007392373.png)
发现在默认情况下，分区表和非分区表存储结构是一致的，但分区表通常是因为数据量巨大，才分区的，在处理 cdc 日志时，通常也希望能按照分区处理。
通过修改参数设置按照分区存储，执行：

```
kubectl exec basic-ticdc-0 -it -n tidb-cluster -- /bin/bash
vi config
```

在 config 里面写入：

```
[sink]
date-separator = 'day'
enable-partition-separator = true
```

其中：
enable-partition-separator：开启按照分区分割目录
date-separator：按照分区分割目录的下层按天分割目录
保存 config 文件，执行：

```
./cdc cli changefeed create \
    --server=http://basic-ticdc-peer:8301 \
    --sink-uri="s3://tidbbinlog-separator/?protocol=canal-json&endpoint=http://minio-headless.minio:9000&access-key=XXX&secret-access-key=XXX&force-path-style=true" \
    --changefeed-id="oss-replication-task-separator" \
    --config ./config
```

实际情况如下：
![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1674007400729.png)
目录为tidbbinlog-separator/test/student\_partition/438627372744835072/86/2023-01-09/CDC000001.json
目录中，86 为分区的 ID，2023-01-09 为按时间分割的目录，这两种分区方式可以根据需要，分别使用和组合使用。

## 展望

我们在 Mysql 的 binlog 日志上，对于类似的处理方式已经有一些应用于生产，对于 json 格式的 cdc 日志，我们团队也有一些应用心得，有时间会写一篇文章补充介绍。
