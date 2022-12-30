---
title: EMR with TiSpark（on EKS ） - TiDB 社区技术月刊
sidebar_label: EMR with TiSpark（on EKS ）
hide_title: true
description: 在 AWS 上 Spark 有 3 种部署形式：emr serverless，EMR on EC2，EMR on EKS，考虑到 TiSpark 需要和 PD，TiKV 进行交互，使用 EMR on EKS 默认网络是连通的，以下的方案是基于 EMR on EKS 展开。
keywords: [TiDB, EMR, TiSpark, EKS]
---

# EMR with TiSpark（on EKS ）

> 作者：王歌

## 背景描述

现有集群部署在 EKS 上，使用 TiDB Operator 部署的 TiDB 集群

使用 spark 主要想实现以下功能：

1. ETL（批处理数据，从 TiDB 读取数据进行加工，然后再写入到 TiDB ）

2. 加速 AP 查询

客户倾向于使用托管的 spark，在 AWS 上 Spark 有 3 种部署形式：emr serverless，EMR on EC2，EMR on EKS，考虑到 TiSpark 需要和 PD，TiKV 进行交互，使用 EMR on EKS 默认网络是连通的，以下的方案是基于 EMR on EKS 展开。

## 方案简介

1. 在 EKS 上，已存在 TiDB Operator 部署的 TiDB 集群

2. 启动 EMR on EKS 的集群访问并通过 EMR 注册 EKS 集群

3. 自定义 docker 镜像

4. 配置 spark pod 并启动任务

## 操作步骤

### 现有 TiDB 集群部署在 EKS 上

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1667960319190.png)

### 基于 EKS 部署 EMR

[参考文档](https://docs.aws.amazon.com/zh_cn/emr/latest/EMR-on-EKS-DevelopmentGuide/setting-up-cli.html)

### 启用 Amazon EMR on EKS 的集群访问

eksctl create iamidentitymapping --cluster wg1 --namespace tidb-cluster --service-name "emr-containers"

```bash
namespace=tidb-cluster

cat - <<EOF | kubectl apply -f - --namespace "${namespace}"
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: emr-containers
  namespace: ${namespace}
rules:
  - apiGroups: [""]
    resources: ["namespaces"]
    verbs: ["get"]
  - apiGroups: [""]
    resources: ["serviceaccounts", "services", "configmaps", "events", "pods", "pods/log"]
    verbs: ["get", "list", "watch", "describe", "create", "edit", "delete", "deletecollection", "annotate", "patch", "label"]
  - apiGroups: [""]
    resources: ["secrets"]
    verbs: ["create", "patch", "delete", "watch"]
  - apiGroups: ["apps"]
    resources: ["statefulsets", "deployments"]
    verbs: ["get", "list", "watch", "describe", "create", "edit", "delete", "annotate", "patch", "label"]
  - apiGroups: ["batch"]
    resources: ["jobs"]
    verbs: ["get", "list", "watch", "describe", "create", "edit", "delete", "annotate", "patch", "label"]
  - apiGroups: ["extensions"]
    resources: ["ingresses"]
    verbs: ["get", "list", "watch", "describe", "create", "edit", "delete", "annotate", "patch", "label"]
  - apiGroups: ["rbac.authorization.k8s.io"]
    resources: ["roles", "rolebindings"]
    verbs: ["get", "list", "watch", "describe", "create", "edit", "delete", "deletecollection", "annotate", "patch", "label"]
EOF



namespace=tidb-cluster
cat - <<EOF | kubectl apply -f - --namespace "${namespace}"
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: emr-containers
  namespace: ${namespace}
subjects:
- kind: User
  name: emr-containers
  apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: Role
  name: emr-containers
  apiGroup: rbac.authorization.k8s.io
EOF
```

eksctl create iamidentitymapping --cluster wg1 --arn "arn:aws:iam::378955295993:role/AWSServiceRoleForAmazonEMRContainers" --username emr-containers

### 在 EKS 集群上为服务账户（IRSA）启用 IAM 角色

aws eks describe-cluster --name wg1 --query "cluster.identity.oidc.issuer" --output text
<https://oidc.eks.ap-northeast-1.amazonaws.com/id/965000E562F657CEFEBB5E681CB5A46F>

eksctl utils associate-iam-oidc-provider --cluster wg1 --approve

**create iam role for job execution**

```bash
cat <<EoF > emr-trust-policy.json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "elasticmapreduce.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EoF
```

aws iam create-role --role-name EMRContainers-JobExecutionRole --assume-role-policy-document file://emr-trust-policy.json

**update relationship for job execution role**

aws emr-containers update-role-trust-policy --cluster-name wg1 --namespace tidb-cluster --role-name EMRContainers-JobExecutionRole

### 通过 Amazon EMR 注册 Amazon EKS 集群

aws emr-containers create-virtual-cluster --name emr1009 --container-provider '{
"id": "wg1",
"type": "EKS",
"info": {
"eksInfo": {
"namespace": "tidb-cluster"
}
}
}'

### 查看 emr

aws emr-containers list-virtual-clusters

```bash
"virtualClusters": [
        {
            "id": "afqacgyj4oo41apmbhsk2plpw",
            "name": "emr1009",
            "arn": "arn:aws:emr-containers:ap-northeast-1:378955295993:/virtualclusters/afqacgyj4oo41apmbhsk2plpw",
            "state": "RUNNING",
            "containerProvider": {
                "type": "EKS",
                "id": "wg1",
                "info": {
                    "eksInfo": {
                        "namespace": "tidb-cluster"
                    }
                }
            },
            "createdAt": "2022-10-09T03:19:28+00:00",
            "tags": {}
        },
```

### 删除 emr

aws emr-containers delete-virtual-cluster --id e5uoso9wwz5v1nilwe3yu92f7

### demo

export VIRTUAL_CLUSTER_ID=$(aws emr-containers list-virtual-clusters --query "virtualClusters[?state=='RUNNING'].id" --output text)
export EMR_ROLE_ARN=$(aws iam get-role --role-name EMRContainers-JobExecutionRole --query Role.Arn --output text)

aws emr-containers start-job-run --virtual-cluster-id=$VIRTUAL_CLUSTER_ID --name=pi-2 --execution-role-arn=$EMR_ROLE_ARN --release-label=emr-6.2.0-latest --job-driver='{
"sparkSubmitJobDriver": {
"entryPoint": "local:///usr/lib/spark/examples/src/main/python/pi.py",
"sparkSubmitParameters": "--conf spark.executor.instances=1 --conf spark.executor.memory=2G --conf spark.executor.cores=1 --conf spark.driver.cores=1"
}
}'

### 运行 demo 之后，会启动 pod

kubectl get pod -ntidb-cluster
NAME                               READY   STATUS    RESTARTS   AGE
000000030s8cnaq04ql-tvlv6          2/2     Running   0          8m48s
basic-discovery-84b7dd85dd-k5ljz   1/1     Running   0          45m
basic-monitor-0                    4/4     Running   0          45m
basic-pd-0                         1/1     Running   0          45m
basic-pd-1                         1/1     Running   0          45m
basic-pd-2                         1/1     Running   0          45m
basic-tidb-0                       2/2     Running   0          43m
basic-tikv-0                       1/1     Running   0          44m
basic-tikv-1                       1/1     Running   0          44m
basic-tikv-2                       1/1     Running   0          44m
spark-000000030s8cnaq04ql-driver   0/2     Pending   0          8m11s

运行 demo 之后，会自动创建 EMR 运行所需的 SA，如下：

```SQL
tidb-cluster      emr-containers-sa-spark-client-378955295993-189nnyj7mn9w2lqiewgg1u0l3jhmo0z69yjkj9u6qhosj8l     1         7s
tidb-cluster      emr-containers-sa-spark-driver-378955295993-189nnyj7mn9w2lqiewgg1u0l3jhmo0z69yjkj9u6qhosj8l     1         6s
tidb-cluster      emr-containers-sa-spark-executor-378955295993-189nnyj7mn9w2lqiewgg1u0l3jhmo0z69yjkj9u6qhosj8l   1         6s
```

需要为 emr-containers-sa-spark-driver 加上以下额外权限：

```SQL
cat > spark-driver-access.yaml <<EOF
kind: ClusterRole
apiVersion: rbac.authorization.k8s.io/v1
metadata:
  namespace: tidb-cluster
  name: spark-driver-reader
rules:
- apiGroups: [""]
  resources: ["services"]
  verbs: ["get", "watch", "list", "delete"]
- apiGroups: [""]
  resources: ["persistentvolumeclaims"]
  verbs: ["get", "watch", "list", "delete"]
EOF

kubectl apply -f spark-driver-access.yaml

kubectl get sa -n tidb-cluster

kubectl create clusterrolebinding tispark-access \
  --clusterrole=spark-driver-reader  \
  --serviceaccount=tidb-cluster:emr-containers-sa-spark-driver-XXXX  
```

### 自定义 docker 镜像

[参考文档](https://docs.aws.amazon.com/zh_cn/emr/latest/EMR-on-EKS-DevelopmentGuide/docker-custom-images-steps.html)

Dockerfile 需要将 tispark 和 mysql-connector 的 jar 包放入到 spark 的 jars 目录下，参考：

注意 TiSpark 的版本需要和 spark 匹配，否则 job 会报错。（emr-6.7 对应的 spark 版本是 3.2.1-amzn-0）

```SQL
cat > Dockerfile <<EOF 
FROM 059004520145.dkr.ecr.ap-northeast-1.amazonaws.com/spark/emr-6.7.0:latest
USER root
### Add customization commands here ####
COPY tispark-assembly-3.2_2.12-3.1.1.jar /usr/lib/spark/jars/
COPY mysql-connector-java-8.0.27.jar /usr/lib/spark/jars/
USER hadoop:hadoop
EOF
```

### 配置 spark job

[参考文档](https://www.eksworkshop.com/advanced/430_emr_on_eks/eks_emr_using_node_selectors/####)

#### 创建节点组，并打上标签 dedicated: emr

```SQL
cat newtidb.yaml
apiVersion: eksctl.io/v1alpha5
kind: ClusterConfig
metadata:
  name: wg1
  region: ap-northeast-1
availabilityZones: ['ap-northeast-1a','ap-northeast-1d']

nodeGroups:
  - name: emr
    instanceType: m5.xlarge
    desiredCapacity: 3
    privateNetworking: true
    availabilityZones: ["ap-northeast-1a"]
    labels:
      dedicated: emr
    taints:
      dedicated: emr:NoSchedule

eksctl create nodegroup -f  newtidb.yaml
```

#### Spark pod 模板

  将以下示例 pod 模板和 python 脚本上传到 s3 存储桶。

```SQL
cat > spark_executor_nyc_taxi_template.yml <<EOF 
apiVersion: v1
kind: Pod
spec:
  volumes:
    - name: source-data-volume
      emptyDir: {}
    - name: metrics-files-volume
      emptyDir: {}
  nodeSelector:
    dedicated: emr
  tolerations:
  - effect: NoSchedule
    key: dedicated
    operator: Equal
    value: emr
  containers:
  - name: spark-kubernetes-executor # This will be interpreted as Spark executor container
EOF

cat > spark_driver_nyc_taxi_template.yml <<EOF 
apiVersion: v1
kind: Pod
spec:
  volumes:
    - name: source-data-volume
      emptyDir: {}
    - name: metrics-files-volume
      emptyDir: {}
  nodeSelector:
    dedicated: emr
  tolerations:
  - effect: NoSchedule
    key: dedicated
    operator: Equal
    value: emr
  containers:
  - name: spark-kubernetes-driver # This will be interpreted as Spark driver container
EOF
```

以下是 spark+jdbc 的方式读取 TiDB

```markdown
from __future__ import print_function

import sys
from time import sleep
from pyspark.sql import SparkSession
from pyspark.sql import functions as F
from pyspark.sql.window import Window



if __name__ == "__main__":
    """
        Usage: pi [partitions]
    """
    spark = SparkSession\
        .builder\
        .appName("test")\
        .getOrCreate()
    # jdbcUrl = "jdbc:mysql://a0d9e6340ceb14267addbc87ce05e057-f6e62300101bf1da.elb.ap-northeast-1.amazonaws.com:4000/test"
    # jdbcDriver = "com.mysql.jdbc.Driver"
    # jdbcDF = spark.read.format("jdbc").option("url", jdbcUrl).option("dbtable", "t1").option("user", "root").option("password", "").option("database","test").option("driver", jdbcDriver).load()
    # jdbcDF.show()

    # print("end")
    prop = {'user': 'root', 
        'password': '', 
        'driver': 'com.mysql.jdbc.Driver'}
    # database 地址(需要修改)
    url = 'jdbc:mysql://a0d9e6340ceb14267addbc87ce05e057-f6e62300101bf1da.elb.ap-northeast-1.amazonaws.com:4000/test'
    # 读取表
    data = spark.read.jdbc(url=url, table='t1', properties=prop)
    # 打印data数据类型
    print(type(data))
    # 展示数据
    data.show()

    spark.stop()
```

  以下是 TiSpark 读取 TiKV 并将数据写入到 TiDB 中

```markdown
from __future__ import print_function

import sys
from time import sleep
from pyspark.sql import SparkSession
from pyspark.sql import functions as F
from pyspark.sql.window import Window



if __name__ == "__main__":
    """
        Usage: pi [partitions]
    """
    spark = SparkSession\
        .builder\
        .appName("ti1")\
        .getOrCreate()
    spark.sql("use tidb_catalog")
    df1 = spark.sql("select * from test.t1")

    df1.write.format("tidb").option("tidb.addr", "a0d9e6340ceb14267addbc87ce05e057-f6e62300101bf1da.elb.ap-northeast-1.amazonaws.com").option("tidb.password","").option("tidb.port","4000").option("tidb.user","root").option("database","test").option("table","t2").mode("append").save()
 
    spark.stop()
```

#### 创建 spark job

```SQL
aws emr-containers start-job-run --cli-input-json file://request-nytaxi.json
```

```SQL
cat > request-nytaxi.json <<EOF 
{
    "name": "nytaxi",
    "virtualClusterId": "${VIRTUAL_CLUSTER_ID}",
    "executionRoleArn": "${EMR_ROLE_ARN}",
    "releaseLabel": "emr-6.7.0-latest",
    "jobDriver": {
        "sparkSubmitJobDriver": {
            "entryPoint": "${s3DemoBucket}/nytaxi.py",
            "sparkSubmitParameters": "--conf spark.kubernetes.driver.podTemplateFile=${s3DemoBucket}/pod_templates/spark_driver_nyc_taxi_template.yml \
            --conf spark.kubernetes.executor.podTemplateFile=${s3DemoBucket}/pod_templates/spark_executor_nyc_taxi_template.yml \
            --conf spark.executor.instances=3 \
            --conf spark.executor.memory=2G \
            --conf spark.executor.cores=2 \
            --conf spark.driver.cores=1"
        }
    },
    "configurationOverrides": {
        "applicationConfiguration": [
            {
                "classification": "spark-defaults",
                "properties": {
                  "spark.kubernetes.container.image": "自定义镜像的地址",
                  "spark.dynamicAllocation.enabled": "false",
                  "spark.kubernetes.executor.deleteOnTermination": "true",
                  "spark.tispark.pd.addresses": "pd-ip:port",
                  "spark.sql.extensions": "org.apache.spark.sql.TiExtensions",
                  "spark.sql.catalog.tidb_catalog": "org.apache.spark.sql.catalyst.catalog.TiCatalog",
                  "spark.sql.catalog.tidb_catalog.pd.addresses": "pd-ip:port"
                }
            }
        ],
        "monitoringConfiguration": {
            "cloudWatchMonitoringConfiguration": {
                "logGroupName": "/emr-on-eks/eksworkshop-eksctl",
                "logStreamNamePrefix": "nytaxi"
            },
            "s3MonitoringConfiguration": {
                "logUri": "${s3DemoBucket}/"
            }
        }
    }
}
EOF
```

#### 查看 job 运行是否成功

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1667960319178.png)

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1667960319701.png)

## 附录

- [TiSpark 下载](https://github.com/pingcap/tispark/releases)

- [TiSpark 使用](https://github.com/pingcap/tispark/blob/master/docs/userguide_3.0.md)

- [PySpark 使用](https://github.com/pingcap/tispark/wiki/PySpark#%E4%BD%95%E6%97%B6%E4%BD%BF%E7%94%A8-pytispark)
